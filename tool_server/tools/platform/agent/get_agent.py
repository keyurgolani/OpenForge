import httpx
from protocol import BaseTool, ToolContext, ToolResult


class GetAgentTool(BaseTool):
    @property
    def id(self): return "platform.agent.get_agent"

    @property
    def category(self): return "platform.agent"

    @property
    def display_name(self): return "Get Agent"

    @property
    def description(self):
        return (
            "Get detailed information about a specific agent definition by its ID. "
            "Returns the agent's full configuration including name, description, system prompt, "
            "input parameters, output definitions, LLM config, tools config, and memory config. "
            "Use platform.agent.list_agents first to find agent IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The UUID of the agent definition to retrieve",
                },
            },
            "required": ["agent_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        agent_id = params.get("agent_id")
        if not agent_id:
            return ToolResult(success=False, error="agent_id is required")
        url = f"{context.main_app_url}/api/v1/agents/{agent_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Agent {agent_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
