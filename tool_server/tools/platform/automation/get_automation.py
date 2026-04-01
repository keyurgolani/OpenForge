import httpx
from protocol import BaseTool, ToolContext, ToolResult


class GetAutomationTool(BaseTool):
    @property
    def id(self): return "platform.automation.get"

    @property
    def category(self): return "platform.automation"

    @property
    def display_name(self): return "Get Automation"

    @property
    def description(self):
        return (
            "Get detailed information about a specific automation definition by its ID. "
            "Returns the automation's full configuration including its graph structure "
            "(agent nodes, sink nodes, edges, static inputs), deployment input schema, "
            "status, and metadata. "
            "Use platform.automation.list first to find automation IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "automation_id": {
                    "type": "string",
                    "description": "The UUID of the automation to retrieve",
                },
            },
            "required": ["automation_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        automation_id = params.get("automation_id")
        if not automation_id:
            return ToolResult(success=False, error="automation_id is required")
        url = f"{context.main_app_url}/api/v1/automations/{automation_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Automation {automation_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
