import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ReadConversationTool(BaseTool):
    @property
    def id(self): return "memory.read_conversation"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Read Conversation Messages"

    @property
    def description(self):
        return (
            "Read the messages from a specific conversation (chat) by its ID. "
            "Returns all messages with their role (user/assistant) and content. "
            "Use memory.list_conversations or memory.search_workspace to find the conversation_id first, "
            "then use this tool to read the full conversation content for summarization or analysis."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "conversation_id": {
                    "type": "string",
                    "description": "The conversation UUID to read.",
                },
                "limit": {
                    "type": "integer",
                    "default": 100,
                    "description": "Maximum number of messages to return.",
                },
            },
            "required": ["conversation_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        conversation_id = params.get("conversation_id", "").strip()
        if not conversation_id:
            return ToolResult(success=False, error="conversation_id is required")

        url = (
            f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}"
            f"/conversations/{conversation_id}"
        )
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params={
                    "limit": params.get("limit", 100),
                    "include_archived": "true",
                })
                resp.raise_for_status()
            data = resp.json()
            messages = data.get("messages", [])
            formatted = [
                {
                    "role": m.get("role"),
                    "content": (m.get("content") or "")[:3000],
                }
                for m in messages
                if m.get("role") in ("user", "assistant")
            ]
            return ToolResult(success=True, output={
                "id": data.get("id"),
                "title": data.get("title"),
                "message_count": data.get("message_count", len(messages)),
                "messages": formatted,
            })
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
