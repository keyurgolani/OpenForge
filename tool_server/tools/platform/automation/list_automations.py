import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListAutomationsTool(BaseTool):
    @property
    def id(self): return "platform.automation.list"

    @property
    def category(self): return "platform.automation"

    @property
    def display_name(self): return "List Automations"

    @property
    def description(self):
        return (
            "List all automation definitions in the system. Automations are reusable DAG workflows "
            "built by wiring agent nodes and sink nodes together. They do nothing until deployed. "
            "Returns automation names, IDs, slugs, descriptions, status, and tags. "
            "Optionally filter by status (draft, active, paused, archived)."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by automation status (e.g., draft, active, paused, archived). Omit to return all.",
                },
                "limit": {
                    "type": "integer",
                    "default": 100,
                    "description": "Maximum number of automations to return",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/automations"
        query: dict = {"limit": params.get("limit", 100)}
        if "status" in params:
            query["status"] = params["status"]
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            data = resp.json()
            automations = data.get("automations", [])
            summary = [
                {
                    "id": a.get("id"),
                    "name": a.get("name"),
                    "slug": a.get("slug"),
                    "description": a.get("description"),
                    "status": a.get("status"),
                    "tags": a.get("tags", []),
                    "is_template": a.get("is_template", False),
                }
                for a in automations
            ]
            return ToolResult(success=True, output={"automations": summary, "total": data.get("total", len(summary))})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
