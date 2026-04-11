import httpx
from protocol import BaseTool, ToolContext, ToolResult


class InvokeAgentTool(BaseTool):
    @property
    def id(self): return "platform.agent.invoke"

    @property
    def category(self): return "platform.agent"

    @property
    def display_name(self): return "Invoke Agent"

    @property
    def description(self):
        return (
            "Invoke an AI agent to perform a task and return its response. "
            "Use this to delegate sub-tasks to specialist agents. "
            "You MUST specify agent_id with a valid agent slug — "
            "use platform.agent.list_agents to discover available agents and their slugs. "
            "Common slugs: knowledge-retriever, web-searcher, knowledge-curator, code-engineer, page-reader. "
            "Provide a clear, specific, self-contained instruction. "
            "Returns the agent's full text response and execution timeline."
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
                "agent_id": {
                    "type": "string",
                    "description": (
                        "Slug of the agent to invoke. Required. "
                        "Use platform.agent.list_agents to get available slugs. "
                        "Examples: 'knowledge-retriever', 'web-searcher', 'code-engineer', 'knowledge-curator'."
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
            "required": ["instruction", "agent_id"],
        }

    @property
    def risk_level(self):
        return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        instruction = params.get("instruction", "").strip()
        if not instruction:
            return ToolResult(success=False, error="instruction is required")

        workspace_id = context.workspace_id
        transfer = params.get("transfer", False)

        if transfer:
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
        scope_path = params.get("_scope_path")
        if scope_path is not None:
            payload["scope_path"] = scope_path
        call_id = params.get("_call_id")
        if call_id is not None:
            payload["call_id"] = call_id
        # Root forwarding context for deep nesting
        for key in ("_root_execution_id", "_root_conversation_id", "_root_workspace_id", "_call_id_path"):
            val = params.get(key)
            if val is not None:
                payload[key.lstrip("_")] = val

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
