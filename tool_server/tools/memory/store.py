import json
from protocol import BaseTool, ToolContext, ToolResult


class StoreMemoryTool(BaseTool):
    @property
    def id(self): return "memory.store"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Store Working Memory"

    @property
    def description(self):
        return (
            "Store a value in your private working scratchpad for this task execution. "
            "Working memory is ephemeral — it is scoped to the current execution session, "
            "is invisible to the user, and expires when the task ends. "
            "Use it to remember intermediate results, computed values, or scratch notes "
            "while completing a multi-step task. "
            "NOT for saving content the user wants to keep — use workspace.save_knowledge for that."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Key to store the value under"},
                "value": {"description": "Value to store (any JSON-serializable type)"},
            },
            "required": ["key", "value"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            redis = aioredis.from_url(get_settings().redis_url)
            redis_key = f"agent_memory:{context.execution_id}:{params['key']}"
            await redis.set(redis_key, json.dumps(params["value"]), ex=3600)
            await redis.aclose()
            return ToolResult(success=True, output=f"Stored '{params['key']}' in working memory")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
