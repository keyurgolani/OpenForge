import httpx
from protocol import BaseTool, ToolContext, ToolResult


class DeleteAutomationTool(BaseTool):
    @property
    def id(self): return "platform.automation.delete"

    @property
    def category(self): return "platform.automation"

    @property
    def display_name(self): return "Delete Automation"

    @property
    def description(self):
        return (
            "Permanently delete an automation definition by its ID. "
            "This cannot be undone. Any existing deployments of this automation should be "
            "torn down first using platform.deployment.teardown. "
            "Use platform.automation.list to find automation IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "automation_id": {
                    "type": "string",
                    "description": "The UUID of the automation to delete",
                },
            },
            "required": ["automation_id"],
        }

    @property
    def risk_level(self): return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        automation_id = params.get("automation_id")
        if not automation_id:
            return ToolResult(success=False, error="automation_id is required")
        url = f"{context.main_app_url}/api/v1/automations/{automation_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.delete(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=f"Deleted automation {automation_id}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Automation {automation_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
