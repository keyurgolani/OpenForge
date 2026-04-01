import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListSinksTool(BaseTool):
    @property
    def id(self): return "platform.sink.list"

    @property
    def category(self): return "platform.sink"

    @property
    def display_name(self): return "List Sinks"

    @property
    def description(self):
        return (
            "List all sink definitions in the system. A sink defines what happens with agent "
            "output values — writing articles, creating knowledge, calling REST APIs, sending "
            "notifications, or logging to history. "
            "Returns sink names, IDs, types, and descriptions. "
            "Optionally filter by sink_type (article, knowledge_create, knowledge_update, "
            "rest_api, notification, log) or search by name."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "sink_type": {
                    "type": "string",
                    "description": "Filter by sink type: article, knowledge_create, knowledge_update, rest_api, notification, log",
                },
                "q": {
                    "type": "string",
                    "description": "Search sinks by name",
                },
                "limit": {
                    "type": "integer",
                    "default": 100,
                    "description": "Maximum number of sinks to return",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/sinks"
        query: dict = {"limit": params.get("limit", 100)}
        if "sink_type" in params:
            query["sink_type"] = params["sink_type"]
        if "q" in params:
            query["q"] = params["q"]
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            data = resp.json()
            sinks = data.get("sinks", [])
            summary = [
                {
                    "id": s.get("id"),
                    "name": s.get("name"),
                    "slug": s.get("slug"),
                    "description": s.get("description"),
                    "sink_type": s.get("sink_type"),
                    "tags": s.get("tags", []),
                }
                for s in sinks
            ]
            return ToolResult(success=True, output={"sinks": summary, "total": data.get("total", len(summary))})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
