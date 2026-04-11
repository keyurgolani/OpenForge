import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListMissionsTool(BaseTool):
    @property
    def id(self): return "platform.mission.list"

    @property
    def category(self): return "platform.mission"

    @property
    def display_name(self): return "List Missions"

    @property
    def description(self):
        return (
            "List all missions, optionally filtered by status. "
            "Returns mission names, IDs, statuses, cycle counts, and scheduling info. "
            "Use this to discover existing missions before creating duplicates, "
            "or to find mission IDs for status checks."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["draft", "active", "paused", "completed", "terminated"],
                    "description": "Filter by mission status (omit for all statuses)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of missions to return (default: 50)",
                    "default": 50,
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        query_params = {}
        status = params.get("status")
        if status:
            query_params["status"] = status
        limit = params.get("limit", 50)
        query_params["limit"] = limit

        url = f"{context.main_app_url}/api/v1/missions"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query_params)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response else ""
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
