"""
Fetch page tool for OpenForge.

Fetches and extracts readable text content from a URL.
"""
from protocol import BaseTool, ToolResult, ToolContext
from config import get_settings
import aiohttp
import logging
import re

logger = logging.getLogger("tool-server.http")


class HttpFetchPageTool(BaseTool):
    """Fetch and extract readable text from a URL."""

    @property
    def id(self) -> str:
        return "http.fetch_page"

    @property
    def category(self) -> str:
        return "http"

    @property
    def display_name(self) -> str:
        return "Fetch Page"

    @property
    def description(self) -> str:
        return """Fetch a web page and extract its readable content.

Downloads the page HTML and extracts the main text content, removing
navigation, ads, and other non-essential elements.

Returns:
- Title of the page
- Main text content
- Meta description (if available)
- Links found on the page

Use for:
- Reading articles and blog posts
- Extracting content from web pages
- Research and information gathering"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch"
                },
                "timeout": {
                    "type": "integer",
                    "default": 30,
                    "description": "Request timeout in seconds"
                },
                "include_links": {
                    "type": "boolean",
                    "default": True,
                    "description": "Include extracted links in the response"
                },
                "max_content_length": {
                    "type": "integer",
                    "default": 50000,
                    "description": "Maximum content length to extract (characters)"
                }
            },
            "required": ["url"]
        }

    @property
    def risk_level(self) -> str:
        return "medium"

    @property
    def max_output_chars(self) -> int:
        return 100000

    def _extract_text(self, html: str) -> str:
        """Extract readable text from HTML using simple heuristics."""
        # Remove script and style elements
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)

        # Remove common non-content elements
        for tag in ['nav', 'header', 'footer', 'aside', 'iframe', 'noscript']:
            html = re.sub(f'<{tag}[^>]*>.*?</{tag}>', '', html, flags=re.DOTALL | re.IGNORECASE)

        # Extract title
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
        title = re.sub(r'<[^>]+>', '', title_match.group(1)).strip() if title_match else ""

        # Extract meta description
        desc_match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if not desc_match:
            desc_match = re.search(r'<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']description["\']', html, re.IGNORECASE)
        description = desc_match.group(1) if desc_match else ""

        # Extract text from paragraphs, headings, and list items
        content_tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'article', 'section', 'div']
        text_parts = []

        for tag in content_tags:
            pattern = f'<{tag}[^>]*>(.*?)</{tag}>'
            matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)
            for match in matches:
                # Clean HTML tags within the content
                text = re.sub(r'<[^>]+>', ' ', match)
                # Normalize whitespace
                text = re.sub(r'\s+', ' ', text).strip()
                if len(text) > 20:  # Skip very short fragments
                    text_parts.append(text)

        # Join with newlines and clean up
        content = '\n\n'.join(text_parts)
        content = re.sub(r'\n{3,}', '\n\n', content)

        return title, description, content

    def _extract_links(self, html: str, base_url: str) -> list:
        """Extract links from HTML."""
        links = []
        seen = set()

        # Find all anchor tags
        pattern = r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>'
        matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)

        for href, text in matches:
            href = href.strip()
            if not href or href.startswith(('#', 'javascript:', 'mailto:')):
                continue

            # Resolve relative URLs
            if href.startswith('/'):
                from urllib.parse import urljoin
                href = urljoin(base_url, href)
            elif not href.startswith(('http://', 'https://')):
                continue

            if href in seen:
                continue
            seen.add(href)

            # Clean link text
            text = re.sub(r'<[^>]+>', '', text).strip()
            text = re.sub(r'\s+', ' ', text)

            links.append({
                "url": href,
                "text": text[:100] if text else ""
            })

        return links[:50]  # Limit to 50 links

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = params.get("url", "").strip()
        if not url:
            return ToolResult(
                success=False,
                output=None,
                error="URL is required"
            )

        # Validate URL scheme
        if not url.startswith(("http://", "https://")):
            return ToolResult(
                success=False,
                output=None,
                error="URL must start with http:// or https://"
            )

        timeout = params.get("timeout", 30)
        include_links = params.get("include_links", True)
        max_content_length = params.get("max_content_length", 50000)

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; OpenForge-ToolServer/1.0; +https://openforge.dev)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        try:
            timeout_config = aiohttp.ClientTimeout(total=timeout)

            async with aiohttp.ClientSession(timeout=timeout_config) as session:
                async with session.get(
                    url,
                    headers=headers,
                    allow_redirects=True,
                    ssl=True
                ) as response:
                    status_code = response.status

                    if status_code != 200:
                        return ToolResult(
                            success=False,
                            output=None,
                            error=f"HTTP error: {status_code}"
                        )

                    content_type = response.headers.get("Content-Type", "")
                    if "text/html" not in content_type and "application/xhtml" not in content_type:
                        return ToolResult(
                            success=False,
                            output=None,
                            error=f"Content is not HTML: {content_type}"
                        )

                    html = await response.text()
                    final_url = str(response.url)

            # Extract content
            title, description, content = self._extract_text(html)

            # Truncate content if needed
            if len(content) > max_content_length:
                content = content[:max_content_length]
                content += "\n\n... [CONTENT TRUNCATED]"

            result = {
                "url": final_url,
                "title": title,
                "description": description,
                "content": content,
                "content_length": len(content),
            }

            # Extract links if requested
            if include_links:
                result["links"] = self._extract_links(html, final_url)

            return ToolResult(
                success=True,
                output=result
            )

        except aiohttp.ClientError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"HTTP request failed: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error fetching page {url}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to fetch page: {str(e)}"
            )
