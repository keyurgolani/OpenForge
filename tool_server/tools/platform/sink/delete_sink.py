import httpx
from protocol import BaseTool, ToolContext, ToolResult


class DeleteSinkTool(BaseTool):
    @property
    def id(self): return "platform.sink.delete"

    @property
    def category(self): return "platform.sink"

    @property
    def display_name(self): return "Delete Sink"

    @property
    def description(self):
        return (
            "Permanently delete a sink definition by its ID. "
            "This cannot be undone. Ensure no automations reference this sink before deleting. "
            "Use platform.sink.list to find sink IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "sink_id": {
                    "type": "string",
                    "description": "The UUID of the sink to delete",
                },
            },
            "required": ["sink_id"],
        }

    @property
    def risk_level(self): return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        sink_id = params.get("sink_id")
        if not sink_id:
            return ToolResult(success=False, error="sink_id is required")
        url = f"{context.main_app_url}/api/v1/sinks/{sink_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.delete(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=f"Deleted sink {sink_id}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Sink {sink_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
