"""
Agent Engine Core for OpenForge v2.

Implements a ReAct loop with tool calling support.
"""
import asyncio
import json
import logging
from typing import Any, Optional, AsyncGenerator
from uuid import UUID
from dataclasses import dataclass, field
from datetime import datetime, timezone

import litellm

from openforge.core.llm_gateway import llm_gateway

logger = logging.getLogger("openforge.agent_engine")

# Configuration
MAX_ITERATIONS = 15
AGENT_SYSTEM_PROMPT = """You are an AI assistant with access to tools. When a user asks you something that requires looking at files, searching for information, writing code, or performing actions, use the appropriate tools.

Think step by step. Use tools when needed, then synthesize your findings into a clear answer.

Available tools will be provided in the function calling schema.

When you have gathered enough information to answer the user's question, provide a clear, helpful response without making additional tool calls."""


@dataclass
class ToolCall:
    """Represents a tool call made by the agent."""
    tool_id: str
    arguments: dict[str, Any]
    result: Optional[Any] = None
    error: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class AgentEvent:
    """Base class for agent events."""
    event_type: str
    execution_id: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class AgentThinkingEvent(AgentEvent):
    """Emitted when the agent is processing."""
    event_type: str = "agent_thinking"
    message: str = ""


@dataclass
class AgentToolCallEvent(AgentEvent):
    """Emitted when the agent makes a tool call."""
    event_type: str = "agent_tool_call"
    tool_id: str = ""
    arguments: dict = field(default_factory=dict)


@dataclass
class AgentToolResultEvent(AgentEvent):
    """Emitted when a tool call completes."""
    event_type: str = "agent_tool_result"
    tool_id: str = ""
    success: bool = True
    result: Any = None
    error: Optional[str] = None


@dataclass
class AgentTokenEvent(AgentEvent):
    """Emitted for each token in the final response."""
    event_type: str = "agent_token"
    token: str = ""


@dataclass
class AgentDoneEvent(AgentEvent):
    """Emitted when the agent finishes."""
    event_type: str = "agent_done"
    response: str = ""
    tool_calls: list = field(default_factory=list)


@dataclass
class AgentErrorEvent(AgentEvent):
    """Emitted when an error occurs."""
    event_type: str = "agent_error"
    error: str = ""


class AgentEngine:
    """
    Executes a ReAct loop with tool calling.

    The engine:
    1. Builds initial messages (system prompt + RAG context + history + user message)
    2. Enters the ReAct loop (max 15 iterations)
    3. Each iteration: calls LLM with tools → if tool_call response, execute tool → add result → continue
    4. If text response, that's the final answer
    5. Publishes events to Redis at each step
    """

    def __init__(self):
        self.redis_client = None

    async def _get_redis(self):
        """Get Redis client for event publishing."""
        if self.redis_client is None:
            from openforge.db.redis_client import get_redis
            self.redis_client = await get_redis()
        return self.redis_client

    async def _publish_event(self, event: AgentEvent) -> None:
        """Publish an event to Redis for WebSocket relay."""
        try:
            redis = await self._get_redis()
            channel = f"agent:{event.execution_id}"
            event_data = {
                "event_type": event.event_type,
                "execution_id": event.execution_id,
                "timestamp": event.timestamp,
                **{k: v for k, v in event.__dict__.items()
                 if k not in ["event_type", "execution_id", "timestamp"]}
            }
            await redis.publish(channel, json.dumps(event_data))
            logger.debug(f"Published {event.event_type} to {channel}")
        except Exception as e:
            logger.error(f"Failed to publish event: {e}")

    def _build_tool_schema(self, tools: list[dict]) -> list[dict]:
        """Build OpenAI-compatible tool schemas from tool definitions."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool["id"],
                    "description": tool["description"],
                    "parameters": tool["input_schema"],
                }
            }
            for tool in tools
        ]

    async def _execute_tool(
        self,
        tool_id: str,
        arguments: dict,
        workspace_id: str,
        tool_dispatcher: Any = None,
    ) -> tuple[bool, Any, Optional[str]]:
        """
        Execute a tool call.

        Returns:
            Tuple of (success, result, error)
        """
        try:
            # Use tool dispatcher if available
            if tool_dispatcher:
                from openforge.services.tool_dispatcher import ToolCallRequest

                request = ToolCallRequest(
                    tool_id=tool_id,
                    parameters=arguments,
                    workspace_id=workspace_id,
                )
                result = await tool_dispatcher.dispatch(request, skip_approval=True)
                return result.success, result.output, result.error

            # Fallback: call tool server directly
            import httpx
            from openforge.config import get_settings

            settings = get_settings()
            tool_server_url = settings.tool_server_url

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{tool_server_url}/tools/execute",
                    json={
                        "tool_id": tool_id,
                        "params": arguments,
                        "context": {
                            "workspace_id": workspace_id,
                            "workspace_path": f"/workspace/{workspace_id}",
                            "execution_id": str(UUID(int=0)),  # Placeholder
                            "main_app_url": settings.main_app_url,
                        }
                    },
                    timeout=60.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return data["success"], data["output"], data.get("error")
                else:
                    return False, None, f"Tool server error: {response.status_code}"

        except httpx.ConnectError:
            logger.error(f"Tool server unreachable: {tool_id}")
            return False, None, "Tools are currently unavailable. The tool server is not responding. Please try again later."
        except httpx.TimeoutException:
            logger.error(f"Tool server timeout: {tool_id}")
            return False, None, "Tool execution timed out. The server may be overloaded. Please try again later."
        except Exception as e:
            logger.exception(f"Tool execution failed: {tool_id}")
            return False, None, f"Tool execution failed: {str(e)}"

    async def run(
        self,
        execution_id: str,
        workspace_id: str,
        conversation_id: str,
        user_message: str,
        conversation_history: list[dict],
        rag_context: str,
        available_tools: list[dict],
        provider_config: dict,
    ) -> str:
        """
        Execute the agent loop.

        Args:
            execution_id: Unique identifier for this execution
            workspace_id: Workspace UUID
            conversation_id: Conversation UUID
            user_message: The user's message
            conversation_history: List of previous messages
            rag_context: Retrieved knowledge context
            available_tools: List of tools the agent can use
            provider_config: LLM provider configuration

        Returns:
            Final response string
        """
        logger.info(f"Starting agent execution: {execution_id}")

        tool_calls_log: list[dict] = []

        try:
            # Build initial messages
            messages = self._build_messages(
                user_message=user_message,
                conversation_history=conversation_history,
                rag_context=rag_context,
            )

            # Build tool schemas
            tool_schemas = self._build_tool_schema(available_tools) if available_tools else None

            # Get provider config
            provider_name = provider_config.get("provider_name", "openai")
            api_key = provider_config.get("api_key", "")
            model = provider_config.get("model", "gpt-4o-mini")
            base_url = provider_config.get("base_url")

            # Publish thinking event
            await self._publish_event(AgentThinkingEvent(
                execution_id=execution_id,
                message="Starting analysis...",
            ))

            # ReAct loop
            for iteration in range(MAX_ITERATIONS):
                logger.debug(f"Agent iteration {iteration + 1}/{MAX_ITERATIONS}")

                # Call LLM
                response = await litellm.acompletion(
                    model=llm_gateway._resolve_model(provider_name, model),
                    messages=messages,
                    api_key=api_key or None,
                    api_base=base_url,
                    tools=tool_schemas,
                    tool_choice="auto" if tool_schemas else None,
                    max_tokens=4000,
                )

                message = response.choices[0].message

                # Check for tool calls
                if message.tool_calls:
                    # Process each tool call
                    for tool_call in message.tool_calls:
                        tool_id = tool_call.function.name
                        arguments = json.loads(tool_call.function.arguments)

                        logger.info(f"Tool call: {tool_id} with args: {arguments}")

                        # Publish tool call event
                        await self._publish_event(AgentToolCallEvent(
                            execution_id=execution_id,
                            tool_id=tool_id,
                            arguments=arguments,
                        ))

                        # Execute tool
                        success, result, error = await self._execute_tool(
                            tool_id=tool_id,
                            arguments=arguments,
                            workspace_id=workspace_id,
                        )

                        # Log tool call
                        tool_calls_log.append({
                            "tool_id": tool_id,
                            "arguments": arguments,
                            "result": result,
                            "error": error,
                            "success": success,
                        })

                        # Publish tool result event
                        await self._publish_event(AgentToolResultEvent(
                            execution_id=execution_id,
                            tool_id=tool_id,
                            success=success,
                            result=result,
                            error=error,
                        ))

                        # Add assistant message with tool call
                        messages.append({
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [{
                                "id": tool_call.id,
                                "type": "function",
                                "function": {
                                    "name": tool_id,
                                    "arguments": json.dumps(arguments),
                                }
                            }]
                        })

                        # Add tool result message
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result) if success else f"Error: {error}",
                        })

                    # Continue loop
                    continue

                # No tool calls - this is the final response
                content = message.content or ""

                # Stream the response
                await self._publish_event(AgentThinkingEvent(
                    execution_id=execution_id,
                    message="Generating response...",
                ))

                # Publish tokens
                for char in content:
                    await self._publish_event(AgentTokenEvent(
                        execution_id=execution_id,
                        token=char,
                    ))
                    await asyncio.sleep(0.001)  # Small delay for smooth streaming

                # Publish done event
                await self._publish_event(AgentDoneEvent(
                    execution_id=execution_id,
                    response=content,
                    tool_calls=tool_calls_log,
                ))

                logger.info(f"Agent execution complete: {execution_id}")
                return content

            # Max iterations reached
            error_msg = "Maximum iterations reached without a final answer"
            await self._publish_event(AgentErrorEvent(
                execution_id=execution_id,
                error=error_msg,
            ))
            return error_msg

        except Exception as e:
            logger.exception(f"Agent execution failed: {execution_id}")
            await self._publish_event(AgentErrorEvent(
                execution_id=execution_id,
                error=str(e),
            ))
            raise

    def _build_messages(
        self,
        user_message: str,
        conversation_history: list[dict],
        rag_context: str,
    ) -> list[dict]:
        """Build the message list for the LLM."""
        messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]

        # Add RAG context if available
        if rag_context:
            messages.append({
                "role": "system",
                "content": f"Relevant context from your knowledge base:\n\n{rag_context}"
            })

        # Add conversation history
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        # Add current user message
        messages.append({"role": "user", "content": user_message})

        return messages


# Global instance
agent_engine = AgentEngine()
