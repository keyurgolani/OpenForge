import json

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings
from content_boundary import wrap_untrusted


class SearchWebTool(BaseTool):
    @property
    def id(self):
        return "http.search_web"

    @property
    def category(self):
        return "http"

    @property
    def display_name(self):
        return "Search Web"

    @property
    def description(self):
        return "Search the web for current information. Returns titles, URLs, and snippets from multiple search engines."

    @property
    def risk_level(self):
        return "low"

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return",
                    "default": 5,
                },
            },
            "required": ["query"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        query = (params.get("query") or "").strip()
        if not query:
            return ToolResult(success=True, output={"results": [], "message": "No query provided."})
        max_results = params.get("max_results", 5)
        searxng_url = get_settings().searxng_url

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{searxng_url}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "categories": "general",
                    },
                )
                response.raise_for_status()
                data = response.json()
        except httpx.ConnectError:
            return ToolResult(
                success=False,
                error="Search service (SearXNG) is unavailable. It may not be running.",
            )
        except httpx.TimeoutException:
            return ToolResult(
                success=False,
                error="Search request timed out.",
            )
        except Exception as exc:
            return ToolResult(success=False, error=f"Search failed: {exc}")

        results = []
        for r in data.get("results", [])[:max_results]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
                "engine": r.get("engine", ""),
            })

        if not results:
            return ToolResult(success=True, output={"results": [], "message": "No results found."})

        raw_output = json.dumps({"results": results, "query": query}, ensure_ascii=False)
        return ToolResult(success=True, output=wrap_untrusted(raw_output, f"web search: {query}"))
