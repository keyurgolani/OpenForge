import httpx
from protocol import BaseTool, ToolContext, ToolResult


class WorkspaceDeleteKnowledgeTool(BaseTool):
    @property
    def id(self): return "workspace.delete_knowledge"

    @property
    def category(self): return "workspace"

    @property
    def display_name(self): return "Delete Knowledge"

    @property
    def description(self):
        return (
            "Permanently delete a knowledge record from the user's workspace by its ID. "
            "Use workspace.list_knowledge or workspace.search first to find the correct ID. "
            "This removes the record from the user's knowledge base and cannot be undone."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "knowledge_id": {
                    "type": "string",
                    "description": "The UUID of the knowledge record to delete",
                },
            },
            "required": ["knowledge_id"],
        }

    @property
    def risk_level(self): return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        knowledge_id = params["knowledge_id"]
        url = f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}/knowledge/{knowledge_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.delete(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=f"Deleted knowledge record {knowledge_id}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
