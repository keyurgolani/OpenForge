import json
import httpx
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
            "Set persistent=true with a query to search long-term persistent memories across sessions. "
            "NOT for reading the user's knowledge base — use workspace.search or workspace.list_knowledge for that."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Key to retrieve (omit to return all stored entries)"},
                "persistent": {
                    "type": "boolean",
                    "default": False,
                    "description": "If true, search long-term persistent memory instead of ephemeral Redis",
                },
                "query": {
                    "type": "string",
                    "description": "Search query for persistent memory recall (required when persistent=true)",
                },
                "workspace_id": {
                    "type": "string",
                    "description": "Workspace to search (persistent mode). Omit to search ALL user workspaces.",
                },
                "limit": {
                    "type": "integer",
                    "default": 5,
                    "description": "Max results to return (only used when persistent=true)",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        persistent = params.get("persistent", False)

        if persistent:
            return await self._recall_persistent(params, context)
        return await self._recall_redis(params, context)

    async def _recall_persistent(self, params: dict, context: ToolContext) -> ToolResult:
        """Recall from workspace knowledge via semantic search.

        When workspace_id is provided, searches that single workspace.
        When omitted, searches ALL user workspaces and tags results by workspace name.
        """
        try:
            query = params.get("query", params.get("key", ""))
            if not query:
                return ToolResult(success=False, error="A query is required for persistent memory recall")

            limit = params.get("limit", 5)
            workspace_id = params.get("workspace_id")

            async with httpx.AsyncClient(timeout=15.0) as client:
                if workspace_id:
                    # Single workspace search
                    results = await self._search_workspace(client, context.main_app_url, workspace_id, query, limit)
                    if not results:
                        return ToolResult(success=True, output="No persistent memories found matching the query.")
                    return ToolResult(success=True, output=results)

                # Cross-workspace: fetch all user workspaces, search each
                ws_resp = await client.get(
                    f"{context.main_app_url}/api/v1/workspaces",
                    params={"ownership_type": "user"},
                )
                ws_resp.raise_for_status()
                workspaces = ws_resp.json()

                all_results = []
                per_ws_limit = max(2, limit // max(1, len(workspaces)))
                for ws in workspaces:
                    ws_results = await self._search_workspace(
                        client, context.main_app_url, ws["id"], query, per_ws_limit,
                    )
                    for r in ws_results:
                        r["workspace_name"] = ws.get("name", "")
                        r["workspace_id"] = ws["id"]
                    all_results.extend(ws_results)

                # Sort by score descending and truncate
                all_results.sort(key=lambda r: r.get("score", 0), reverse=True)
                all_results = all_results[:limit]

                if not all_results:
                    return ToolResult(success=True, output="No persistent memories found matching the query across any workspace.")
                return ToolResult(success=True, output=all_results)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

    async def _search_workspace(
        self, client: httpx.AsyncClient, base_url: str, workspace_id: str, query: str, limit: int,
    ) -> list:
        """Search a single workspace and return results."""
        try:
            resp = await client.get(
                f"{base_url}/api/v1/workspaces/{workspace_id}/search",
                params={"q": query, "limit": limit, "mode": "chat"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", data) if isinstance(data, dict) else data if isinstance(data, list) else []
        except Exception:
            return []

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
