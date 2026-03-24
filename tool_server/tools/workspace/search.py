import httpx
from protocol import BaseTool, ToolContext, ToolResult


class WorkspaceSearchTool(BaseTool):
    @property
    def id(self): return "workspace.search"

    @property
    def category(self): return "workspace"

    @property
    def display_name(self): return "Search Workspace"

    @property
    def description(self):
        return (
            "Search a workspace's knowledge base using semantic similarity. "
            "Searches across all knowledge saved in the specified workspace (notes, bookmarks, gists, uploaded documents) "
            "AND past chat conversations that have been indexed. "
            "Returns the most relevant matches with titles, snippets, and IDs. "
            "Use this to answer questions about what the user has stored, to find related knowledge, "
            "or to locate a past conversation by topic. "
            "You MUST provide the workspace_id of the workspace you want to search. "
            "Refer to the application context in your system prompt for available workspace IDs. "
            "Results for chat conversations include a `conversation_id` field — use workspace.read_chat "
            "to retrieve the full message history. "
            "NOT the same as memory.recall — this searches user-visible workspace content, not agent scratchpad."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string", "description": "The UUID of the workspace to search. Refer to the application context for available workspace IDs."},
                "query": {"type": "string", "description": "Search query — describe what you are looking for"},
                "limit": {"type": "integer", "default": 5, "description": "Maximum number of results to return"},
                "expand_context": {"type": "boolean", "default": False, "description": "Include parent chunk text for additional context around each result"},
            },
            "required": ["workspace_id", "query"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        workspace_id = params.get("workspace_id")
        if not workspace_id:
            return ToolResult(success=False, error="workspace_id is required. Check your system prompt for available workspace IDs.")
        url = f"{context.main_app_url}/api/v1/workspaces/{workspace_id}/search"
        try:
            query_params = {
                    "q": params["query"],
                    "limit": params.get("limit", 5),
                    "mode": "chat",
                }
            if params.get("expand_context"):
                query_params["expand_context"] = "true"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query_params)
                resp.raise_for_status()
            if not resp.text.strip():
                return ToolResult(success=False, error="Search returned an empty response")
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response.text else "empty"
            return ToolResult(success=False, error=f"Search failed (HTTP {exc.response.status_code}): {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
