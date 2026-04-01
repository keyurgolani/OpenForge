import httpx
from protocol import BaseTool, ToolContext, ToolResult


class UpdateSinkTool(BaseTool):
    @property
    def id(self): return "platform.sink.update"

    @property
    def category(self): return "platform.sink"

    @property
    def display_name(self): return "Update Sink"

    @property
    def description(self):
        return (
            "Update an existing sink definition. "
            "Can update the name, description, config, tags, and icon. "
            "Only provide the fields you want to change — omitted fields remain unchanged. "
            "Use platform.sink.list to find sink IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "sink_id": {
                    "type": "string",
                    "description": "The UUID of the sink to update",
                },
                "name": {
                    "type": "string",
                    "description": "Updated name",
                },
                "description": {
                    "type": "string",
                    "description": "Updated description",
                },
                "config": {
                    "type": "object",
                    "description": "Updated type-specific configuration",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Updated tags",
                },
                "icon": {
                    "type": "string",
                    "description": "Updated icon reference",
                },
            },
            "required": ["sink_id"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        sink_id = params.get("sink_id")
        if not sink_id:
            return ToolResult(success=False, error="sink_id is required")
        url = f"{context.main_app_url}/api/v1/sinks/{sink_id}"
        payload: dict = {}
        for field in ("name", "description", "config", "tags", "icon"):
            if field in params:
                payload[field] = params[field]
        if not payload:
            return ToolResult(success=False, error="At least one field to update is required")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.patch(url, json=payload)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "sink_type": data.get("sink_type"),
                    "message": f"Updated sink {sink_id}",
                },
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Sink {sink_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
