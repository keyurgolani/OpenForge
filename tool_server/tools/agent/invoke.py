import httpx
from protocol import BaseTool, ToolContext, ToolResult


class InvokeAgentTool(BaseTool):
    @property
    def id(self): return "agent.invoke"

    @property
    def category(self): return "agent"

    @property
    def display_name(self): return "Invoke Agent"

    @property
    def description(self):
        return (
            "Invoke an AI agent to perform a task in a workspace and return its response. "
            "THIS IS THE ONLY WAY to access content in another workspace — memory and filesystem "
            "tools only reach the current workspace. "
            "Use this when: (1) the user @mentions another workspace, (2) you need information "
            "from a different workspace, or (3) you need to delegate a subtask to another workspace's agent. "
            "Provide a clear, specific, self-contained instruction. "
            "Specify workspace_id to target a specific workspace (required for cross-workspace access); "
            "omit to run in the current workspace. "
            "Returns the subagent's full text response and execution timeline."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "instruction": {
                    "type": "string",
                    "description": (
                        "The task or question for the agent. Be specific and complete. "
                        "The agent will reason, use tools, and return a full response."
                    ),
                },
                "workspace_id": {
                    "type": "string",
                    "description": (
                        "Target workspace ID. If omitted, the current workspace is used. "
                        "Provide this when delegating to a different workspace."
                    ),
                },
                "agent_id": {
                    "type": "string",
                    "description": (
                        "ID of a specific agent to invoke (e.g. 'optimizer_agent'). "
                        "If omitted, the workspace's default agent is used."
                    ),
                },
                "transfer": {
                    "type": "boolean",
                    "description": (
                        "If true, performs a swarm-style transfer: switches the active agent "
                        "for the current conversation instead of spawning a child conversation. "
                        "Use this when the user should continue talking to the target agent."
                    ),
                    "default": False,
                },
            },
            "required": ["instruction"],
        }

    @property
    def risk_level(self):
        return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        instruction = params.get("instruction", "").strip()
        if not instruction:
            return ToolResult(success=False, error="instruction is required")

        workspace_id = params.get("workspace_id") or context.workspace_id
        transfer = params.get("transfer", False)

        if transfer:
            # Swarm-style transfer: switch active agent for conversation
            agent_id = params.get("agent_id")
            if not agent_id:
                return ToolResult(success=False, error="agent_id is required for transfer mode")

            payload = {
                "target_agent_slug": agent_id,
                "workspace_id": workspace_id,
                "conversation_id": context.conversation_id or "",
            }
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(
                        f"{context.main_app_url}/api/v1/runtime/delegations/transfer",
                        json=payload,
                    )
                    resp.raise_for_status()
                    return ToolResult(success=True, output=resp.json())
            except httpx.HTTPStatusError as exc:
                body = exc.response.text[:300] if exc.response else ""
                return ToolResult(
                    success=False,
                    error=f"Agent transfer HTTP error {exc.response.status_code}: {body}",
                )
            except Exception as exc:
                return ToolResult(success=False, error=str(exc))

        payload = {
            "instruction": instruction,
            "workspace_id": workspace_id,
            "parent_execution_id": context.execution_id,
            "parent_conversation_id": context.conversation_id or None,
            "parent_workspace_id": context.workspace_id or None,
            "execution_chain_id": context.execution_id or None,
        }
        agent_id = params.get("agent_id")
        if agent_id:
            payload["agent_id"] = agent_id
        # scope_path is injected by the parent engine when available
        scope_path = params.get("_scope_path")
        if scope_path is not None:
            payload["scope_path"] = scope_path

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    f"{context.main_app_url}/api/v1/runtime/delegations/invoke",
                    json=payload,
                )
                resp.raise_for_status()
                return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response else ""
            return ToolResult(
                success=False,
                error=f"Agent invocation HTTP error {exc.response.status_code}: {body}",
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
