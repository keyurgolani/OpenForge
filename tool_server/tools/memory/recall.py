import json
import httpx
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
            "Search persistent memories by natural language query. "
            "Use memory_type filter for specific kinds (fact, preference, lesson, context, decision, experience). "
            "Set deep=true for multi-hop cross-workspace search. "
            "Set persistent=false to recall ephemeral scratchpad entries from this execution session."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language search query for memory recall",
                },
                "key": {
                    "type": "string",
                    "description": "Key to retrieve from ephemeral memory (omit to return all stored entries)",
                },
                "persistent": {
                    "type": "boolean",
                    "default": True,
                    "description": "If true (default), search persistent memory. Set false for ephemeral Redis recall.",
                },
                "memory_type": {
                    "type": "string",
                    "enum": ["fact", "preference", "lesson", "context", "decision", "experience"],
                    "description": "Filter results to a specific memory type",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter results by tags",
                },
                "workspace_id": {
                    "type": "string",
                    "description": "Workspace to search. Omit to search across all accessible workspaces.",
                },
                "deep": {
                    "type": "boolean",
                    "default": False,
                    "description": "If true, perform multi-hop cross-workspace search for richer results",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum number of results to return",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        persistent = params.get("persistent", True)

        if persistent:
            return await self._recall_persistent(params, context)
        return await self._recall_redis(params, context)

    async def _recall_persistent(self, params: dict, context: ToolContext) -> ToolResult:
        """Recall from persistent memory via the main app API."""
        try:
            query = params.get("query", params.get("key", ""))
            if not query:
                return ToolResult(success=False, error="A query is required for persistent memory recall")

            body = {
                "query": query,
                "limit": params.get("limit", 10),
                "deep": params.get("deep", False),
            }

            memory_type = params.get("memory_type")
            if memory_type:
                body["memory_type"] = memory_type

            tags = params.get("tags")
            if tags:
                body["tags"] = tags

            workspace_id = params.get("workspace_id") or context.workspace_id or None
            if workspace_id:
                body["workspace_id"] = workspace_id

            url = f"{context.main_app_url}/api/v1/agents/memory/recall"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                data = resp.json()

            memories = data if isinstance(data, list) else data.get("memories", data.get("results", []))

            if not memories:
                return ToolResult(success=True, output="No memories found matching the query.")

            # Format results as readable text
            lines = []
            for i, mem in enumerate(memories, 1):
                content = mem.get("content", "")
                mtype = mem.get("memory_type", "unknown")
                confidence = mem.get("confidence", "?")
                observed = mem.get("observed_at", mem.get("created_at", ""))
                mem_id = mem.get("id", "")
                line = f"{i}. [{mtype}] {content}"
                if confidence != "?":
                    line += f" (confidence: {confidence})"
                if observed:
                    line += f" — {observed}"
                if mem_id:
                    line += f" [id: {mem_id}]"
                lines.append(line)

            return ToolResult(success=True, output="\n".join(lines))
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

    async def _recall_redis(self, params: dict, context: ToolContext) -> ToolResult:
        """Recall from ephemeral Redis memory."""
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
