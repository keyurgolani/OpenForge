import httpx
from protocol import BaseTool, ToolContext, ToolResult


class CreateSinkTool(BaseTool):
    @property
    def id(self): return "platform.sink.create"

    @property
    def category(self): return "platform.sink"

    @property
    def display_name(self): return "Create Sink"

    @property
    def description(self):
        return (
            "Create a new sink definition. A sink defines what happens with agent output values "
            "in automations. "
            "Sink types and their configuration: "
            "- article: writes a document (config: output_format, file_path) "
            "- knowledge_create: creates a knowledge item (config: workspace_id, knowledge_type, field_mappings) "
            "- knowledge_update: updates an existing knowledge item (config: workspace_id, knowledge_id, field_mappings) "
            "- rest_api: calls an external HTTP endpoint (config: url, method, headers, parameter_mappings) "
            "- notification: sends a notification (config: channel, message_template) "
            "- log: records to run/output history (default behavior)"
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Human-readable name for the sink",
                },
                "sink_type": {
                    "type": "string",
                    "enum": ["article", "knowledge_create", "knowledge_update", "rest_api", "notification", "log"],
                    "description": "The type of sink action",
                },
                "description": {
                    "type": "string",
                    "description": "What this sink does",
                },
                "config": {
                    "type": "object",
                    "description": "Type-specific configuration for the sink",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Categorization labels",
                },
                "icon": {
                    "type": "string",
                    "description": "Icon reference",
                },
            },
            "required": ["name", "sink_type"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = params.get("name", "").strip()
        if not name:
            return ToolResult(success=False, error="name is required")
        sink_type = params.get("sink_type", "").strip()
        if not sink_type:
            return ToolResult(success=False, error="sink_type is required")
        url = f"{context.main_app_url}/api/v1/sinks"
        payload: dict = {
            "name": name,
            "sink_type": sink_type,
            "config": params.get("config", {}),
        }
        if "description" in params:
            payload["description"] = params["description"]
        if "tags" in params:
            payload["tags"] = params["tags"]
        if "icon" in params:
            payload["icon"] = params["icon"]
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "slug": data.get("slug"),
                    "sink_type": data.get("sink_type"),
                    "message": f"Created sink '{name}' ({sink_type})",
                },
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
