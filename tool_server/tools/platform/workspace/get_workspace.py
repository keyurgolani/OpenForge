import httpx
from protocol import BaseTool, ToolContext, ToolResult


class GetWorkspaceTool(BaseTool):
    @property
    def id(self): return "platform.workspace.get_workspace"

    @property
    def category(self): return "platform.workspace"

    @property
    def display_name(self): return "Get Workspace"

    @property
    def description(self):
        return (
            "Get detailed information about a specific workspace by its ID. "
            "Returns the workspace's name, description, icon, LLM configuration, "
            "knowledge count, conversation count, and agent settings. "
            "Use platform.workspace.list_workspaces first to find workspace IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "workspace_id": {
                    "type": "string",
                    "description": "The UUID of the workspace to retrieve",
                },
            },
            "required": ["workspace_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        workspace_id = params.get("workspace_id")
        if not workspace_id:
            return ToolResult(success=False, error="workspace_id is required")
        url = f"{context.main_app_url}/api/v1/workspaces/{workspace_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Workspace {workspace_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
