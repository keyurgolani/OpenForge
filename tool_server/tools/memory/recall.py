import json
from protocol import BaseTool, ToolContext, ToolResult


class RecallMemoryTool(BaseTool):
    @property
    def id(self): return "memory.recall"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Recall Memory"

    @property
    def description(self):
        return (
            "Recall memory entries stored during this agent execution. "
            "Pass a key to get a specific entry, or leave empty to get all entries."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Specific key to recall (optional - omit for all)"},
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
                    return ToolResult(success=False, error=f"Memory key '{specific_key}' not found")
                return ToolResult(success=True, output=json.loads(raw))

            # Return all keys
            pattern = f"{prefix}*"
            keys = await redis.keys(pattern)
            memories = {}
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
