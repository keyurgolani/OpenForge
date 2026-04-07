"""web.read_pages — Read multiple web pages concurrently with dual backend."""

from __future__ import annotations

import asyncio

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from content_boundary import wrap_untrusted
from tools.web.clients import Crawl4AIClient
from tools.web.read_page import _extract_content, _BROWSER_HEADERS

# ---------------------------------------------------------------------------
# ReadPagesTool
# ---------------------------------------------------------------------------

_MAX_OUTPUT = 200_000


class ReadPagesTool(BaseTool):
    """Read multiple web pages concurrently via Crawl4AI (primary) with trafilatura fallback."""

    def __init__(self, crawl4ai: Crawl4AIClient) -> None:
        self._crawl4ai = crawl4ai

    # -- metadata --

    @property
    def id(self) -> str:
        return "web.read_pages"

    @property
    def category(self) -> str:
        return "web"

    @property
    def display_name(self) -> str:
        return "Read Multiple Pages"

    @property
    def description(self) -> str:
        return (
            "Read multiple web pages concurrently and return their content. "
            "Much faster than calling web.read_page sequentially. Max 10 URLs."
        )

    @property
    def risk_level(self) -> str:
        return "low"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "urls": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 10,
                    "description": "URLs to read concurrently (max 10)",
                },
                "max_concurrency": {
                    "type": "integer",
                    "default": 5,
                    "description": "Maximum concurrent requests",
                },
                "max_chars_per_page": {
                    "type": "integer",
                    "default": 30000,
                    "description": "Maximum characters to return per page",
                },
            },
            "required": ["urls"],
        }

    @property
    def max_output(self) -> int:
        return _MAX_OUTPUT

    # -- internals --

    async def _read_single(self, url: str, max_chars: int) -> dict:
        """Fetch a single URL using Crawl4AI then trafilatura fallback."""
        try:
            security.validate_url(url)
        except ValueError as exc:
            return {"url": url, "success": False, "error": str(exc)}

        # 1. Try Crawl4AI
        try:
            result = await self._crawl4ai.crawl(url)
            if result["success"]:
                md = result["markdown"]
                if len(md) > max_chars:
                    md = md[:max_chars] + "\n\n[... truncated]"
                return {"url": url, "success": True, "content": md}
        except Exception:
            pass  # Fall through to trafilatura

        # 2. Fallback: trafilatura via httpx
        try:
            async with httpx.AsyncClient(
                timeout=15,
                follow_redirects=True,
                headers=_BROWSER_HEADERS,
            ) as client:
                resp = await client.get(url)

            text = _extract_content(resp.text, url)

            if not text or len(text.strip()) < 50:
                return {
                    "url": url,
                    "success": True,
                    "content": "(minimal content — may require JavaScript)",
                }

            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n[... truncated]"
            return {"url": url, "success": True, "content": text}
        except Exception as exc:
            return {"url": url, "success": False, "error": str(exc)}

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        urls = params.get("urls") or []
        if not urls:
            return ToolResult(success=False, error="No URLs provided.")
        if len(urls) > 10:
            return ToolResult(success=False, error="Maximum 10 URLs allowed.")

        max_concurrency = min(params.get("max_concurrency", 5), 10)
        max_chars = params.get("max_chars_per_page", 30000)
        semaphore = asyncio.Semaphore(max_concurrency)

        async def bounded_fetch(url: str) -> dict:
            async with semaphore:
                return await self._read_single(url, max_chars)

        results = await asyncio.gather(*[bounded_fetch(u) for u in urls])

        parts = []
        for r in results:
            if r["success"]:
                parts.append(f"=== {r['url']} ===\n{r['content']}")
            else:
                parts.append(f"=== {r['url']} ===\nERROR: {r['error']}")

        output = "\n\n".join(parts)
        return self._maybe_truncate("", wrap_untrusted(output, "multiple pages"))
