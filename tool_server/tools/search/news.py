"""News search tool using SearXNG news category."""

import json
from urllib.parse import urlparse

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings
from content_boundary import wrap_untrusted


class SearchNewsTool(BaseTool):
    @property
    def id(self):
        return "search.news"

    @property
    def category(self):
        return "search"

    @property
    def display_name(self):
        return "Search News"

    @property
    def description(self):
        return (
            "Search for recent news articles. Returns titles, URLs, snippets, "
            "and publication dates from news-specific sources. Optimized for "
            "current events, financial news, and geopolitical developments."
        )

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
                    "description": "News search query",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return",
                    "default": 10,
                },
                "time_range": {
                    "type": "string",
                    "enum": ["day", "week", "month", "year"],
                    "default": "week",
                    "description": "Limit results to this time range",
                },
                "language": {
                    "type": "string",
                    "default": "en",
                    "description": "Language code for results",
                },
            },
            "required": ["query"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        query = (params.get("query") or "").strip()
        if not query:
            return ToolResult(success=True, output={"results": [], "message": "No query provided."})
        max_results = params.get("max_results", 10)
        time_range = params.get("time_range", "week")
        language = params.get("language", "en")
        searxng_url = get_settings().searxng_url

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{searxng_url}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "categories": "news",
                        "time_range": time_range,
                        "language": language,
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
                error="News search request timed out.",
                recovery_hints=[
                    "Try a simpler or shorter query",
                    "Try again — the search service may be temporarily slow",
                ],
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"News search failed: {exc}",
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
            return ToolResult(success=True, output={"results": [], "message": "No news results found."})

        raw_output = json.dumps({"results": results, "query": query, "time_range": time_range}, ensure_ascii=False)
        return ToolResult(success=True, output=wrap_untrusted(raw_output, f"news search: {query}"))
