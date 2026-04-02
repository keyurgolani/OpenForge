import json
import httpx
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
            "NOT for saving content the user wants to keep — use workspace.save_knowledge for that. "
            "Set persistent=true to store as long-term agent memory that survives across sessions."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Key to store the value under"},
                "value": {"description": "Value to store (any JSON-serializable type)"},
                "persistent": {
                    "type": "boolean",
                    "default": False,
                    "description": "If true, store as long-term persistent memory instead of ephemeral Redis",
                },
                "type": {
                    "type": "string",
                    "enum": ["fact", "preference", "task_state", "note", "decision", "synthesis", "observation"],
                    "default": "observation",
                    "description": "Memory type (only used when persistent=true)",
                },
                "confidence": {
                    "type": "number",
                    "default": 1.0,
                    "description": "Confidence score 0.0-1.0 (only used when persistent=true)",
                },
            },
            "required": ["key", "value"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        persistent = params.get("persistent", False)

        if persistent:
            return await self._store_persistent(params, context)
        return await self._store_redis(params, context)

    async def _store_persistent(self, params: dict, context: ToolContext) -> ToolResult:
        """Store via the main app's persistent memory API."""
        try:
            value = params["value"]
            content = value if isinstance(value, str) else json.dumps(value, default=str)
            url = f"{context.main_app_url}/api/v1/agents/memory/store"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={
                    "workspace_id": context.workspace_id,
                    "content": f"[{params['key']}] {content}",
                    "memory_type": params.get("type", "observation"),
                    "confidence": params.get("confidence", 1.0),
                })
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output=f"Stored '{params['key']}' in persistent memory (id: {data.get('id', 'unknown')})",
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

    async def _store_redis(self, params: dict, context: ToolContext) -> ToolResult:
        """Store in ephemeral Redis memory."""
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
