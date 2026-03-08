"""
Search knowledge tool for OpenForge.

Searches across workspace knowledge using semantic search.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import logging

logger = logging.getLogger("tool-server.memory")


class MemorySearchKnowledgeTool(BaseTool):
    """Search across workspace knowledge using semantic search."""

    @property
    def id(self) -> str:
        return "memory.search_knowledge"

    @property
    def category(self) -> str:
        return "memory"

    @property
    def display_name(self) -> str:
        return "Search Knowledge"

    @property
    def description(self) -> str:
        return """Search across the workspace's knowledge base using semantic search.

Queries the main application's search API to find relevant knowledge entries.
Returns results ranked by semantic similarity to the query.

Use for:
- Finding relevant information in the knowledge base
- Researching topics across notes and documents
- Context gathering for agent tasks"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum number of results"
                },
                "types": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter by knowledge types (knowledge, fleeting, bookmark, gist, image, audio, pdf)"
                }
            },
            "required": ["query"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        query = params.get("query", "").strip()
        if not query:
            return ToolResult(
                success=False,
                output=None,
                error="Search query is required"
            )

        limit = params.get("limit", 10)
        types = params.get("types", [])

        settings = get_settings()

        try:
            # Call main app's search API
            url = f"{settings.main_app_url}/api/v1/workspaces/{context.workspace_id}/search"

            search_params = {
                "q": query,
                "limit": limit,
            }
            if types:
                search_params["types"] = ",".join(types)

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=search_params)

            if response.status_code == 404:
                return ToolResult(
                    success=False,
                    output=None,
                    error="Workspace not found or search not available"
                )
            if response.status_code != 200:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Search API error: {response.status_code}"
                )

            data = response.json()

            results = []
            for item in data.get("results", []):
                results.append({
                    "id": item.get("id"),
                    "title": item.get("title", "Untitled"),
                    "type": item.get("type", "knowledge"),
                    "score": item.get("score", 0),
                    "snippet": item.get("content", "")[:500] if item.get("content") else "",
                    "created_at": item.get("created_at"),
                    "updated_at": item.get("updated_at"),
                })

            return ToolResult(
                success=True,
                output={
                    "query": query,
                    "results": results,
                    "count": len(results),
                    "total": data.get("total", len(results)),
                }
            )

        except httpx.RequestError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to connect to main app: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error searching knowledge: {query}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to search knowledge: {str(e)}"
            )
