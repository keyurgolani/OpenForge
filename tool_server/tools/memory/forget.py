import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ForgetMemoryTool(BaseTool):
    @property
    def id(self): return "memory.forget"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Forget Memory"

    @property
    def description(self):
        return (
            "Soft-delete a stored memory by ID. "
            "For persistent memories, provide the memory_id (UUID) returned by memory.store or memory.recall. "
            "Set persistent=false with a key to remove an ephemeral scratchpad entry."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "memory_id": {
                    "type": "string",
                    "description": "UUID of the persistent memory to forget",
                },
                "key": {
                    "type": "string",
                    "description": "Key to remove from ephemeral working memory (used when persistent=false)",
                },
                "persistent": {
                    "type": "boolean",
                    "default": True,
                    "description": "If true (default), forget a persistent memory by memory_id. Set false for ephemeral Redis.",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        persistent = params.get("persistent", True)

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

            key = params.get("key")
            if not key:
                return ToolResult(success=False, error="'key' is required for ephemeral memory forget")

            redis = aioredis.from_url(get_settings().redis_url)
            redis_key = f"agent_memory:{context.execution_id}:{key}"
            deleted = await redis.delete(redis_key)
            await redis.aclose()
            if deleted:
                return ToolResult(success=True, output=f"Removed '{key}' from working memory")
            return ToolResult(success=False, error=f"Key '{key}' not found in working memory")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
