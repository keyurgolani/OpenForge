import json
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

# Fallback patterns to strip before text extraction
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


_META_RE = re.compile(r'<meta\s+[^>]*?(?:name|property)\s*=\s*["\']([^"\']+)["\'][^>]*?content\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_META_REV_RE = re.compile(r'<meta\s+[^>]*?content\s*=\s*["\']([^"\']*)["\'][^>]*?(?:name|property)\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL | re.IGNORECASE)


def _extract_content(html: str, url: str, include_links: bool = True) -> str:
    """Extract readable content from HTML using trafilatura with regex fallback."""
    if _HAS_TRAFILATURA:
        extracted = trafilatura.extract(
            html,
            url=url,
            include_links=include_links,
            include_tables=True,
            favor_recall=True,
            deduplicate=True,
        )
        if extracted and len(extracted.strip()) > 100:
            return extracted.strip()
    # Fallback to basic regex stripping
    return _strip_html(html)


def _extract_metadata(html: str) -> dict:
    """Extract title, description, and OG tags from HTML."""
    metadata = {}
    title_match = _TITLE_RE.search(html)
    if title_match:
        metadata["title"] = _strip_html(title_match.group(1)).strip()

    for match in _META_RE.finditer(html):
        name, content = match.group(1).lower(), match.group(2)
        if name in ("description", "og:title", "og:description", "og:image", "og:url", "og:type", "og:site_name",
                     "twitter:title", "twitter:description", "twitter:image", "twitter:card", "author", "keywords"):
            metadata[name] = content

    for match in _META_REV_RE.finditer(html):
        content, name = match.group(1), match.group(2).lower()
        if name not in metadata and name in ("description", "og:title", "og:description", "og:image", "og:url",
                                               "og:type", "og:site_name", "twitter:title", "twitter:description",
                                               "twitter:image", "twitter:card", "author", "keywords"):
            metadata[name] = content

    return metadata


class FetchPageTool(BaseTool):
    @property
    def id(self): return "http.fetch_page"

    @property
    def category(self): return "http"

    @property
    def display_name(self): return "Fetch Web Page"

    @property
    def description(self):
        return "Fetch a web page and return its text content (HTML tags stripped)."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
                "timeout": {"type": "number", "default": 30},
                "extract_mode": {
                    "type": "string",
                    "enum": ["text", "text_with_links", "metadata"],
                    "default": "text",
                    "description": (
                        "Extraction mode: 'text' returns plain text content, "
                        "'text_with_links' preserves hyperlinks in the output, "
                        "'metadata' returns page title, description, and OG tags"
                    ),
                },
                "max_chars": {
                    "type": "integer",
                    "default": 80000,
                    "description": "Maximum characters to return (max 200000)",
                },
            },
            "required": ["url"],
        }

    @property
    def max_output(self): return 200000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = params["url"]
        try:
            security.validate_url(url)
        except ValueError as exc:
            return ToolResult(success=False, error=str(exc))

        timeout = params.get("timeout", 30)
        extract_mode = params.get("extract_mode", "text")
        max_chars = min(params.get("max_chars", 80000), 200000)

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

            if extract_mode == "metadata":
                metadata = _extract_metadata(resp.text)
                metadata["url"] = url
                metadata["status_code"] = resp.status_code
                raw = json.dumps(metadata, ensure_ascii=False)
                return ToolResult(success=True, output=wrap_untrusted(raw, url))

            include_links = extract_mode == "text_with_links"
            text = _extract_content(resp.text, url, include_links=include_links)
            if not text or len(text.strip()) < 50:
                return ToolResult(
                    success=True,
                    output=wrap_untrusted(
                        "Page returned minimal text content. The site may require "
                        "JavaScript to render, or the page may be empty. Try a "
                        "different URL or use search_web to find alternative sources.",
                        url,
                    ),
                )
            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n[... truncated]"
            wrapped = wrap_untrusted(text, url)
            return self._maybe_truncate("", wrapped)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
