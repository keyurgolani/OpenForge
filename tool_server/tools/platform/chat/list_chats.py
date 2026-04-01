import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListChatsTool(BaseTool):
    @property
    def id(self): return "platform.chat.list_chats"

    @property
    def category(self): return "platform.chat"

    @property
    def display_name(self): return "List Chats"

    @property
    def description(self):
        return (
            "List chat conversations. Returns conversation titles, IDs, agent associations, "
            "and message counts. Optionally filter by agent_id to see only that agent's conversations. "
            "Use platform.chat.read_chat to read a specific conversation's messages."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Filter chats by a specific agent ID. If omitted, lists all conversations.",
                },
                "include_archived": {
                    "type": "boolean",
                    "default": False,
                    "description": "Whether to include archived conversations.",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/chat/conversations"
        query: dict = {}
        agent_id = params.get("agent_id")
        if agent_id:
            query["agent_id"] = agent_id
        if params.get("include_archived", False):
            query["include_archived"] = "true"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            convs = resp.json()
            slim = [
                {
                    "id": c.get("id"),
                    "agent_id": c.get("agent_id"),
                    "title": c.get("title"),
                    "message_count": c.get("message_count", 0),
                    "updated_at": c.get("updated_at"),
                }
                for c in (convs or [])
            ]
            return ToolResult(success=True, output=slim)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
