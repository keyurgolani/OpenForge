"""Image search tool using SearXNG images category."""

import json
from urllib.parse import urlparse

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings
from content_boundary import wrap_untrusted


class SearchImagesTool(BaseTool):
    @property
    def id(self):
        return "search.images"

    @property
    def category(self):
        return "search"

    @property
    def display_name(self):
        return "Search Images"

    @property
    def description(self):
        return (
            "Search the web for images. Returns thumbnail URLs, source URLs, "
            "and dimensions from multiple search engines."
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
                    "description": "Image search query",
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
                        "categories": "images",
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
                error="Image search request timed out.",
                recovery_hints=[
                    "Try a simpler or shorter query",
                    "Try again — the search service may be temporarily slow",
                ],
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Image search failed: {exc}",
                recovery_hints=[
                    "Try again in 30 seconds",
                    "Use web.read_page on a known URL as an alternative",
                ],
            )

        results = []
        for r in data.get("results", [])[:max_results]:
            source_url = r.get("url", "")
            results.append({
                "title": r.get("title", ""),
                "thumbnail_url": r.get("thumbnail_src", r.get("img_src", "")),
                "source_url": source_url,
                "img_src": r.get("img_src", ""),
                "width": r.get("img_format", "").split("x")[0] if "x" in str(r.get("img_format", "")) else None,
                "height": r.get("img_format", "").split("x")[1] if "x" in str(r.get("img_format", "")) else None,
                "engine": r.get("engine", ""),
                "source_domain": urlparse(source_url).netloc if source_url else "",
            })

        if not results:
            return ToolResult(success=True, output={"results": [], "message": "No image results found."})

        raw_output = json.dumps({"results": results, "query": query}, ensure_ascii=False)
        return ToolResult(success=True, output=wrap_untrusted(raw_output, f"image search: {query}"))
