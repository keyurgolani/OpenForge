import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListAgentsTool(BaseTool):
    @property
    def id(self): return "platform.agent.list_agents"

    @property
    def category(self): return "platform.agent"

    @property
    def display_name(self): return "List Agents"

    @property
    def description(self):
        return (
            "List all agent definitions in the system. Returns agent names, IDs, slugs, "
            "descriptions, tags, input parameters, and output definitions. "
            "Use this to discover available agents for invocation, automation composition, "
            "or to understand what agents exist and what they do. "
            "Agent IDs can be used with platform.agent.invoke to delegate tasks."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "default": 100,
                    "description": "Maximum number of agents to return",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/agents"
        query = {"limit": params.get("limit", 100)}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            data = resp.json()
            agents = data.get("agents", [])
            summary = [
                {
                    "id": a.get("id"),
                    "name": a.get("name"),
                    "slug": a.get("slug"),
                    "description": a.get("description"),
                    "tags": a.get("tags", []),
                    "parameters": a.get("parameters", []),
                    "output_definitions": a.get("output_definitions", []),
                }
                for a in agents
            ]
            return ToolResult(success=True, output={"agents": summary, "total": data.get("total", len(summary))})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
