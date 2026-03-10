import json
from protocol import BaseTool, ToolContext, ToolResult


class RecallMemoryTool(BaseTool):
    @property
    def id(self): return "memory.recall"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Recall Working Memory"

    @property
    def description(self):
        return (
            "Recall values you previously stored in your working scratchpad during this task session. "
            "Pass a key to retrieve a specific value, or omit the key to list all stored entries. "
            "Working memory is private to this execution and expires when the task ends — "
            "it does not persist across conversations. "
            "NOT for reading the user's knowledge base — use workspace.search or workspace.list_knowledge for that."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Key to retrieve (omit to return all stored entries)"},
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            redis = aioredis.from_url(get_settings().redis_url)
            prefix = f"agent_memory:{context.execution_id}:"

            specific_key = params.get("key")
            if specific_key:
                raw = await redis.get(f"{prefix}{specific_key}")
                await redis.aclose()
                if raw is None:
                    return ToolResult(success=False, error=f"No working memory entry found for key '{specific_key}'")
                return ToolResult(success=True, output=json.loads(raw))

            # Return all keys for this execution
            keys = await redis.keys(f"{prefix}*")
            memories: dict = {}
            for key in keys:
                key_str = key.decode("utf-8") if isinstance(key, bytes) else key
                short_key = key_str[len(prefix):]
                raw = await redis.get(key)
                if raw:
                    memories[short_key] = json.loads(raw)

            await redis.aclose()
            return ToolResult(success=True, output=memories)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
