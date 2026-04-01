import httpx
from protocol import BaseTool, ToolContext, ToolResult


class CreateAutomationTool(BaseTool):
    @property
    def id(self): return "platform.automation.create"

    @property
    def category(self): return "platform.automation"

    @property
    def display_name(self): return "Create Automation"

    @property
    def description(self):
        return (
            "Create a new automation definition. An automation is a reusable DAG workflow "
            "that wires agent nodes and sink nodes together. It does nothing until deployed. "
            "After creation, use the automation editor UI or additional API calls to build "
            "the graph (add agent nodes, sink nodes, and wire them together). "
            "Provide a name and optionally a description, tags, and icon."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Human-readable name for the automation",
                },
                "description": {
                    "type": "string",
                    "description": "What this automation does",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Categorization labels for the automation",
                },
                "icon": {
                    "type": "string",
                    "description": "Icon reference for the automation",
                },
            },
            "required": ["name"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = params.get("name", "").strip()
        if not name:
            return ToolResult(success=False, error="name is required")
        url = f"{context.main_app_url}/api/v1/automations"
        payload: dict = {"name": name}
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
                    "status": data.get("status"),
                    "message": f"Created automation '{name}'",
                },
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
