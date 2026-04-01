import httpx
from protocol import BaseTool, ToolContext, ToolResult


class DeleteKnowledgeTool(BaseTool):
    @property
    def id(self): return "platform.workspace.delete_knowledge"

    @property
    def category(self): return "platform.workspace"

    @property
    def display_name(self): return "Delete Knowledge"

    @property
    def description(self):
        return (
            "Permanently delete a knowledge record from the user's workspace by its ID. "
            "Use platform.workspace.list_knowledge or platform.workspace.search first to find the correct ID. "
            "This removes the record from the user's knowledge base and cannot be undone."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "workspace_id": {
                    "type": "string",
                    "description": "The UUID of the workspace containing the knowledge record. Refer to the application context for available workspace IDs.",
                },
                "knowledge_id": {
                    "type": "string",
                    "description": "The UUID of the knowledge record to delete",
                },
            },
            "required": ["workspace_id", "knowledge_id"],
        }

    @property
    def risk_level(self): return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        workspace_id = params.get("workspace_id")
        if not workspace_id:
            return ToolResult(success=False, error="workspace_id is required. Check your system prompt for available workspace IDs.")
        knowledge_id = params["knowledge_id"]
        url = f"{context.main_app_url}/api/v1/workspaces/{workspace_id}/knowledge/{knowledge_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.delete(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=f"Deleted knowledge record {knowledge_id}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
