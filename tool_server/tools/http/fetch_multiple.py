import asyncio
import re

import httpx
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from content_boundary import wrap_untrusted

try:
    import trafilatura
    _HAS_TRAFILATURA = True
except ImportError:
    _HAS_TRAFILATURA = False

_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_BLANK_RE = re.compile(r"\n{3,}")


def _strip_html(html: str) -> str:
    text = _SCRIPT_RE.sub("", html)
    text = _STYLE_RE.sub("", text)
    text = _TAG_RE.sub(" ", text)
    text = _BLANK_RE.sub("\n\n", text)
    return text.strip()


def _extract_content(html: str, url: str) -> str:
    if _HAS_TRAFILATURA:
        extracted = trafilatura.extract(
            html, url=url, include_links=True, include_tables=True,
            favor_recall=True, deduplicate=True,
        )
        if extracted and len(extracted.strip()) > 100:
            return extracted.strip()
    return _strip_html(html)


class FetchMultipleTool(BaseTool):
    @property
    def id(self):
        return "http.fetch_multiple"

    @property
    def category(self):
        return "http"

    @property
    def display_name(self):
        return "Fetch Multiple Pages"

    @property
    def description(self):
        return (
            "Fetch multiple web pages concurrently and return their text content. "
            "Much faster than calling fetch_page sequentially for each URL. "
            "Returns results for all URLs in a single response."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "urls": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 10,
                    "description": "URLs to fetch concurrently (max 10)",
                },
                "timeout_per_url": {
                    "type": "number",
                    "default": 15,
                    "description": "Timeout in seconds for each URL",
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
    def max_output(self):
        return 200000

    async def _fetch_one(self, url: str, timeout: float, max_chars: int) -> dict:
        try:
            security.validate_url(url)
        except ValueError as exc:
            return {"url": url, "success": False, "error": str(exc)}

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://openforge.dev)",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            ) as client:
                resp = await client.get(url)
            text = _extract_content(resp.text, url)
            if not text or len(text.strip()) < 50:
                return {"url": url, "success": True, "content": "(minimal content — page may require JavaScript)"}
            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n[... truncated]"
            return {"url": url, "success": True, "content": text}
        except Exception as exc:
            return {"url": url, "success": False, "error": str(exc)}

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        urls = params.get("urls") or []
        if not urls:
            return ToolResult(success=False, error="No URLs provided.")
        if len(urls) > 10:
            return ToolResult(success=False, error="Maximum 10 URLs allowed.")

        timeout = params.get("timeout_per_url", 15)
        max_concurrency = min(params.get("max_concurrency", 5), 10)
        max_chars = params.get("max_chars_per_page", 30000)

        semaphore = asyncio.Semaphore(max_concurrency)

        async def bounded_fetch(url: str) -> dict:
            async with semaphore:
                return await self._fetch_one(url, timeout, max_chars)

        results = await asyncio.gather(*[bounded_fetch(u) for u in urls])

        parts = []
        for r in results:
            if r["success"]:
                parts.append(f"=== {r['url']} ===\n{r['content']}")
            else:
                parts.append(f"=== {r['url']} ===\nERROR: {r['error']}")

        output = "\n\n".join(parts)
        return self._maybe_truncate("", wrap_untrusted(output, "multiple pages"))
