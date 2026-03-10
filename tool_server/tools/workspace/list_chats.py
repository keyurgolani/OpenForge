import httpx
from protocol import BaseTool, ToolContext, ToolResult


class WorkspaceListChatsTool(BaseTool):
    @property
    def id(self): return "workspace.list_chats"

    @property
    def category(self): return "workspace"

    @property
    def display_name(self): return "List Chats"

    @property
    def description(self):
        return (
            "List all conversations (chat threads) in the current workspace. "
            "Returns conversation titles, IDs, and message counts. "
            "Use this to find a specific conversation by name or to browse all chats before reading one. "
            "Once you have the conversation ID, use workspace.read_chat to read its full messages. "
            "To find a conversation by topic rather than title, use workspace.search instead."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "include_archived": {
                    "type": "boolean",
                    "default": False,
                    "description": "Whether to include archived conversations.",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}/conversations"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params={
                    "include_archived": str(params.get("include_archived", False)).lower(),
                })
                resp.raise_for_status()
            convs = resp.json()
            slim = [
                {
                    "id": c.get("id"),
                    "title": c.get("title"),
                    "message_count": c.get("message_count", 0),
                    "updated_at": c.get("updated_at"),
                }
                for c in (convs or [])
            ]
            return ToolResult(success=True, output=slim)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
