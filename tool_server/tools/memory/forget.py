import httpx
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
            "keeping your scratchpad clean during long multi-step tasks. "
            "Set persistent=true with a memory_id to forget a persistent memory entry."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "The key to remove from working memory"},
                "persistent": {
                    "type": "boolean",
                    "default": False,
                    "description": "If true, forget a persistent memory entry by memory_id",
                },
                "memory_id": {
                    "type": "string",
                    "description": "UUID of the persistent memory to forget (required when persistent=true)",
                },
            },
            "required": ["key"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        persistent = params.get("persistent", False)

        if persistent:
            return await self._forget_persistent(params, context)
        return await self._forget_redis(params, context)

    async def _forget_persistent(self, params: dict, context: ToolContext) -> ToolResult:
        """Forget a persistent memory via the main app API."""
        try:
            memory_id = params.get("memory_id")
            if not memory_id:
                return ToolResult(success=False, error="memory_id is required for persistent forget")

            url = f"{context.main_app_url}/api/v1/agents/memory/forget"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={"memory_id": memory_id})
                resp.raise_for_status()
            return ToolResult(success=True, output=f"Persistent memory '{memory_id}' forgotten.")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

    async def _forget_redis(self, params: dict, context: ToolContext) -> ToolResult:
        """Forget an ephemeral Redis memory entry."""
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
