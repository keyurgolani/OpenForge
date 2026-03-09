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
            "Use this to delegate work to another workspace's agent, or to get information "
            "from a specific workspace. Provide a clear, complete instruction. "
            "Optionally specify a workspace_id to target a different workspace — defaults to "
            "the current workspace. Returns the agent's text response and execution timeline."
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

        payload = {
            "instruction": instruction,
            "workspace_id": workspace_id,
            "parent_execution_id": context.execution_id,
        }

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    f"{context.main_app_url}/api/v1/agent/invoke",
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
