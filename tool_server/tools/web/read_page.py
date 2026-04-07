"""web.read_page — Read a web page with Crawl4AI primary and trafilatura fallback."""

from __future__ import annotations

import re

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from content_boundary import wrap_untrusted
from tools.web.clients import Crawl4AIClient

try:
    import trafilatura

    _HAS_TRAFILATURA = True
except ImportError:
    _HAS_TRAFILATURA = False

# ---------------------------------------------------------------------------
# Regex helpers (shared with legacy fetch_page.py)
# ---------------------------------------------------------------------------

_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_BLANK_RE = re.compile(r"\n{3,}")


def _strip_html(html: str) -> str:
    """Basic regex fallback for HTML stripping."""
    text = _SCRIPT_RE.sub("", html)
    text = _STYLE_RE.sub("", text)
    text = _TAG_RE.sub(" ", text)
    text = _BLANK_RE.sub("\n\n", text)
    return text.strip()


def _extract_content(html: str, url: str) -> str:
    """Extract readable content from HTML using trafilatura with regex fallback."""
    if _HAS_TRAFILATURA:
        extracted = trafilatura.extract(
            html,
            url=url,
            include_links=True,
            include_tables=True,
            favor_recall=True,
            deduplicate=True,
        )
        if extracted and len(extracted.strip()) > 100:
            return extracted.strip()
    return _strip_html(html)


# ---------------------------------------------------------------------------
# ReadPageTool
# ---------------------------------------------------------------------------

_MAX_CHARS = 200_000

_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://openforge.dev)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class ReadPageTool(BaseTool):
    """Read a web page via Crawl4AI (primary) with trafilatura fallback."""

    def __init__(self, crawl4ai: Crawl4AIClient) -> None:
        self._crawl4ai = crawl4ai

    # -- metadata --

    @property
    def id(self) -> str:
        return "web.read_page"

    @property
    def category(self) -> str:
        return "web"

    @property
    def display_name(self) -> str:
        return "Read Web Page"

    @property
    def description(self) -> str:
        return (
            "Read a web page and return its content as LLM-optimized markdown. "
            "Handles JavaScript-rendered pages and anti-bot protection automatically. "
            "For interactive pages (clicking, typing), use browser.open instead."
        )

    @property
    def risk_level(self) -> str:
        return "low"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to read"},
                "max_chars": {
                    "type": "integer",
                    "default": 80000,
                    "description": "Maximum characters to return (max 200000)",
                },
            },
            "required": ["url"],
        }

    @property
    def max_output(self) -> int:
        return _MAX_CHARS

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url: str = params["url"]
        try:
            security.validate_url(url)
        except ValueError as exc:
            return ToolResult(success=False, error=str(exc))

        max_chars = min(params.get("max_chars", 80000), _MAX_CHARS)

        # 1. Try Crawl4AI first
        try:
            result = await self._crawl4ai.crawl(url)
            if result["success"]:
                content = result["markdown"]
                if len(content) > max_chars:
                    content = content[:max_chars] + "\n\n[... truncated]"
                wrapped = wrap_untrusted(content, url)
                return self._maybe_truncate("", wrapped)
        except Exception:
            pass  # Fall through to trafilatura

        # 2. Fallback: trafilatura via httpx
        try:
            async with httpx.AsyncClient(
                timeout=30,
                follow_redirects=True,
                headers=_BROWSER_HEADERS,
            ) as client:
                resp = await client.get(url)

            text = _extract_content(resp.text, url)

            if not text or len(text.strip()) < 50:
                return ToolResult(
                    success=True,
                    output=wrap_untrusted(
                        "Page returned minimal content. May require JavaScript.",
                        url,
                    ),
                    recovery_hints=["Use browser.open for interactive pages"],
                )

            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n[... truncated]"

            wrapped = wrap_untrusted(text, url)
            return self._maybe_truncate("", wrapped)
        except Exception as exc:
            return ToolResult(
                success=False,
                error=str(exc),
                recovery_hints=["Use browser.open for interactive pages"],
            )
