"""General web search tool using SearXNG."""

import json
from urllib.parse import urlparse

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings
from content_boundary import wrap_untrusted


class SearchWebTool(BaseTool):
    @property
    def id(self):
        return "search.web"

    @property
    def category(self):
        return "search"

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
                recovery_hints=[
                    "Try again in 30 seconds",
                    "Use web.read_page on a known URL as an alternative",
                ],
            )
        except httpx.TimeoutException:
            return ToolResult(
                success=False,
                error="Search request timed out.",
                recovery_hints=[
                    "Try a simpler or shorter query",
                    "Try again — the search service may be temporarily slow",
                ],
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Search failed: {exc}",
                recovery_hints=[
                    "Try again in 30 seconds",
                    "Use web.read_page on a known URL as an alternative",
                ],
            )

        results = []
        for r in data.get("results", [])[:max_results]:
            url = r.get("url", "")
            results.append({
                "title": r.get("title", ""),
                "url": url,
                "snippet": r.get("content", ""),
                "engine": r.get("engine", ""),
                "published_date": r.get("publishedDate", ""),
                "source_domain": urlparse(url).netloc if url else "",
            })

        if not results:
            return ToolResult(success=True, output={"results": [], "message": "No results found."})

        raw_output = json.dumps({"results": results, "query": query}, ensure_ascii=False)
        return ToolResult(success=True, output=wrap_untrusted(raw_output, f"web search: {query}"))
