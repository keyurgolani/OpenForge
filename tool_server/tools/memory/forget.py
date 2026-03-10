from protocol import BaseTool, ToolContext, ToolResult


class ForgetMemoryTool(BaseTool):
    @property
    def id(self): return "memory.forget"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Forget Working Memory"

    @property
    def description(self):
        return (
            "Remove a specific entry from your working scratchpad. "
            "Use this to discard a value you stored with memory.store when it is no longer needed, "
            "keeping your scratchpad clean during long multi-step tasks."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "The key to remove from working memory"},
            },
            "required": ["key"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            redis = aioredis.from_url(get_settings().redis_url)
            redis_key = f"agent_memory:{context.execution_id}:{params['key']}"
            deleted = await redis.delete(redis_key)
            await redis.aclose()
            if deleted:
                return ToolResult(success=True, output=f"Removed '{params['key']}' from working memory")
            return ToolResult(success=False, error=f"Key '{params['key']}' not found in working memory")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
