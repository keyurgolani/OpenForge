import httpx
from protocol import BaseTool, ToolContext, ToolResult


class SearchWorkspaceTool(BaseTool):
    @property
    def id(self): return "memory.search_workspace"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Search Workspace Knowledge"

    @property
    def description(self):
        return (
            "Search the workspace knowledge base using semantic search. "
            "Returns relevant knowledge records that the user has stored in their workspace. "
            "Use this to look up information from the user's notes, bookmarks, and documents."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "limit": {"type": "integer", "default": 5, "description": "Max results to return"},
            },
            "required": ["query"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}/search"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params={
                    "q": params["query"],
                    "limit": params.get("limit", 5),
                    "mode": "chat",
                })
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
