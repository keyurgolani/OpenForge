import httpx
from protocol import BaseTool, ToolContext, ToolResult


class UpdateAutomationTool(BaseTool):
    @property
    def id(self): return "platform.automation.update"

    @property
    def category(self): return "platform.automation"

    @property
    def display_name(self): return "Update Automation"

    @property
    def description(self):
        return (
            "Update an existing automation definition's metadata. "
            "Can update the name, description, status, tags, and icon. "
            "Only provide the fields you want to change — omitted fields remain unchanged. "
            "Use platform.automation.list or platform.automation.get to find automation IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "automation_id": {
                    "type": "string",
                    "description": "The UUID of the automation to update",
                },
                "name": {
                    "type": "string",
                    "description": "Updated name",
                },
                "description": {
                    "type": "string",
                    "description": "Updated description",
                },
                "status": {
                    "type": "string",
                    "description": "Updated status (draft, active, paused, archived)",
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
            "required": ["automation_id"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        automation_id = params.get("automation_id")
        if not automation_id:
            return ToolResult(success=False, error="automation_id is required")
        url = f"{context.main_app_url}/api/v1/automations/{automation_id}"
        payload: dict = {}
        for field in ("name", "description", "status", "tags", "icon"):
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
                    "status": data.get("status"),
                    "message": f"Updated automation {automation_id}",
                },
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Automation {automation_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
