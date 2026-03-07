"""
Web search tool for OpenForge.

Searches the web using SearxNG or a search API.
"""
from protocol import BaseTool, ToolResult, ToolContext
from config import get_settings
import aiohttp
import logging
from typing import Optional

logger = logging.getLogger("tool-server.http")


class HttpSearchWebTool(BaseTool):
    """Search the web via SearxNG or search API."""

    @property
    def id(self) -> str:
        return "http.search_web"

    @property
    def category(self) -> str:
        return "http"

    @property
    def display_name(self) -> str:
        return "Search Web"

    @property
    def description(self) -> str:
        return """Search the web for information.

Uses a configured search engine (SearxNG instance or search API) to find
relevant web pages. Returns search results with titles, URLs, and snippets.

Use for:
- Finding information on the web
- Research and fact-checking
- Discovering relevant resources

Note: Requires search engine configuration in the tool server settings."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "max_results": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum number of results to return"
                },
                "engines": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Specific search engines to use (e.g., ['google', 'bing'])"
                },
                "category": {
                    "type": "string",
                    "enum": ["general", "images", "news", "videos", "science"],
                    "default": "general",
                    "description": "Search category"
                }
            },
            "required": ["query"]
        }

    @property
    def risk_level(self) -> str:
        return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        query = params.get("query", "").strip()
        if not query:
            return ToolResult(
                success=False,
                output=None,
                error="Search query is required"
            )

        max_results = params.get("max_results", 10)
        engines = params.get("engines", [])
        category = params.get("category", "general")

        settings = get_settings()

        # Check if search is configured
        if not settings.search_url:
            return ToolResult(
                success=False,
                output=None,
                error="Web search is not configured. Set SEARCH_URL in tool server settings."
            )

        try:
            headers = {
                "User-Agent": "OpenForge-ToolServer/1.0",
                "Accept": "application/json",
            }

            # Build search parameters for SearxNG
            search_params = {
                "q": query,
                "format": "json",
                "pageno": 1,
                "category": category if category != "general" else None,
            }

            if engines:
                search_params["engines"] = ",".join(engines)

            # Remove None values
            search_params = {k: v for k, v in search_params.items() if v is not None}

            timeout = aiohttp.ClientTimeout(total=30)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    settings.search_url,
                    params=search_params,
                    headers=headers,
                    ssl=True
                ) as response:
                    if response.status != 200:
                        return ToolResult(
                            success=False,
                            output=None,
                            error=f"Search API error: {response.status}"
                        )

                    data = await response.json()

            # Parse results
            results = []
            for item in data.get("results", [])[:max_results]:
                result = {
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "snippet": item.get("content", ""),
                    "engine": item.get("engine", "unknown"),
                }
                if result["url"]:  # Only include results with URLs
                    results.append(result)

            # Also extract any instant answers
            answers = data.get("answers", [])
            suggestions = data.get("suggestions", [])

            return ToolResult(
                success=True,
                output={
                    "query": query,
                    "results": results,
                    "count": len(results),
                    "answers": answers[:3] if answers else [],
                    "suggestions": suggestions[:5] if suggestions else [],
                }
            )

        except aiohttp.ClientError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Search request failed: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error searching web for: {query}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to search: {str(e)}"
            )
