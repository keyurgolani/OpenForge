import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ReadChatTool(BaseTool):
    @property
    def id(self): return "platform.chat.read_chat"

    @property
    def category(self): return "platform.chat"

    @property
    def display_name(self): return "Read Chat"

    @property
    def description(self):
        return (
            "Read messages from a chat conversation. If conversation_id is omitted, reads the "
            "current conversation — useful for reviewing older messages beyond the context window. "
            "Supports cursor-based pagination via before_id to page through older messages. "
            "Use platform.chat.list_chats to find conversation IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "conversation_id": {
                    "type": "string",
                    "description": (
                        "The conversation UUID to read. If omitted, reads the current conversation."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "default": 50,
                    "description": "Maximum number of messages to return.",
                },
                "before_id": {
                    "type": "string",
                    "description": (
                        "Message UUID for cursor-based pagination — returns messages before this one. "
                        "Use this to page through older messages."
                    ),
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        conversation_id = params.get("conversation_id", "").strip() or (
            context.conversation_id or ""
        )
        if not conversation_id:
            return ToolResult(
                success=False,
                error="conversation_id is required (none provided and no current conversation available)",
            )

        url = f"{context.main_app_url}/api/v1/chat/conversations/{conversation_id}"
        query: dict = {"limit": params.get("limit", 50)}
        before_id = params.get("before_id", "").strip() if params.get("before_id") else ""
        if before_id:
            query["before_id"] = before_id

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            data = resp.json()
            messages = data.get("messages", [])
            formatted = [
                {
                    "id": m.get("id"),
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
