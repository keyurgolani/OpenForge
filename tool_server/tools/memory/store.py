import json
import httpx
from protocol import BaseTool, ToolContext, ToolResult


class StoreMemoryTool(BaseTool):
    @property
    def id(self): return "memory.store"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Store Memory"

    @property
    def description(self):
        return (
            "Store a persistent memory that survives across sessions and conversations. "
            "Memory types and when to use each:\n"
            "- fact: verified information about users, projects, or domains\n"
            "- preference: user style, conventions, or workflow preferences\n"
            "- lesson: corrections, mistakes to avoid, or successful approaches\n"
            "- context: situational background or project state\n"
            "- decision: choices made with their rationale\n"
            "- experience: tool outcomes, API behaviors, or runtime observations\n"
            "Set persistent=false for ephemeral scratchpad notes scoped to this execution only."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The content to store as a memory (required if key not provided)",
                },
                "key": {
                    "type": "string",
                    "description": "Optional key for backward compatibility. Used as Redis key in ephemeral mode, or prepended to content in persistent mode.",
                },
                "value": {"description": "Value to store (used with key for ephemeral mode)"},
                "persistent": {
                    "type": "boolean",
                    "default": True,
                    "description": "If true (default), store as long-term persistent memory. Set false for ephemeral Redis scratchpad.",
                },
                "memory_type": {
                    "type": "string",
                    "enum": ["fact", "preference", "lesson", "context", "decision", "experience"],
                    "default": "context",
                    "description": "Category of memory being stored",
                },
                "confidence": {
                    "type": "number",
                    "default": 1.0,
                    "description": "Confidence score 0.0-1.0 (only used when persistent=true)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags for categorizing and filtering memories",
                },
                "workspace_id": {
                    "type": "string",
                    "description": "Workspace to associate the memory with. Auto-detected from context if omitted.",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        persistent = params.get("persistent", True)

        if persistent:
            return await self._store_persistent(params, context)
        return await self._store_redis(params, context)

    async def _store_persistent(self, params: dict, context: ToolContext) -> ToolResult:
        """Store via the main app's persistent memory API."""
        try:
            # Resolve content: prefer explicit content, fall back to key+value
            content = params.get("content")
            if not content:
                key = params.get("key")
                value = params.get("value", "")
                if key:
                    value_str = value if isinstance(value, str) else json.dumps(value, default=str)
                    content = f"[{key}] {value_str}"
                else:
                    return ToolResult(success=False, error="Either 'content' or 'key' must be provided")

            workspace_id = params.get("workspace_id") or context.workspace_id or None
            agent_id = context.agent_id or None
            conversation_id = context.conversation_id or None

            body = {
                "content": content,
                "memory_type": params.get("memory_type", "context"),
                "confidence": params.get("confidence", 1.0),
                "tags": params.get("tags", []),
                "workspace_id": workspace_id,
                "source_agent_id": agent_id,
                "source_conversation_id": conversation_id,
            }

            url = f"{context.main_app_url}/api/v1/agents/memory/store"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
            data = resp.json()
            label = params.get("key") or content[:60]
            return ToolResult(
                success=True,
                output=f"Stored '{label}' in persistent memory (id: {data.get('id', 'unknown')})",
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

    async def _store_redis(self, params: dict, context: ToolContext) -> ToolResult:
        """Store in ephemeral Redis memory."""
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            key = params.get("key")
            if not key:
                return ToolResult(success=False, error="'key' is required for ephemeral memory storage")

            value = params.get("value", params.get("content", ""))
            redis = aioredis.from_url(get_settings().redis_url)
            redis_key = f"agent_memory:{context.execution_id}:{key}"
            await redis.set(redis_key, json.dumps(value), ex=3600)
            await redis.aclose()
            return ToolResult(success=True, output=f"Stored '{key}' in working memory")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
