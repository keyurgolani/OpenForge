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
            "Search a workspace's knowledge base using semantic search. "
            "Returns relevant knowledge records that the user has stored in the specified workspace. "
            "You MUST provide the workspace_id of the workspace you want to search. "
            "Refer to the application context in your system prompt for available workspace IDs. "
            "Use this to look up information from the user's notes, bookmarks, and documents."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string", "description": "The UUID of the workspace to search. Refer to the application context for available workspace IDs."},
                "query": {"type": "string", "description": "Search query"},
                "limit": {"type": "integer", "default": 5, "description": "Max results to return"},
            },
            "required": ["workspace_id", "query"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        workspace_id = params.get("workspace_id")
        if not workspace_id:
            return ToolResult(success=False, error="workspace_id is required. Check your system prompt for available workspace IDs.")
        url = f"{context.main_app_url}/api/v1/workspaces/{workspace_id}/search"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params={
                    "q": params["query"],
                    "limit": params.get("limit", 5),
                    "mode": "chat",
                })
                resp.raise_for_status()
            if not resp.text.strip():
                return ToolResult(success=False, error="Search returned an empty response")
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response.text else "empty"
            return ToolResult(success=False, error=f"Search failed (HTTP {exc.response.status_code}): {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
