"""
Bookmark content processor for OpenForge.

Handles URL-based content extraction with multiple fallback strategies:
1. Domain-specific extractors (GitHub, etc.)
2. Raw markdown files
3. Cloudflare-scraped markdown
4. HTML-to-markdown conversion
5. Jina Reader API
6. Chrome headless rendering
7. Metadata fallback
"""
import logging
import re
from typing import Optional
from uuid import UUID
from html import unescape
import asyncio

import httpx

from .base import ContentProcessor, ProcessorResult

logger = logging.getLogger("openforge.bookmark_processor")


class BookmarkProcessor(ContentProcessor):
    """Process bookmark/URL content."""

    name = "bookmark"
    supported_types = ["text/x-url", "text/x-bookmark", "application/x-url"]
    supported_extensions = [".url", ".webloc"]

    # Configuration
    _BOOKMARK_CONTENT_MAX_CHARS = 8000
    _JINA_READER_TIMEOUT_SECONDS = 30

    def __init__(self):
        # Domain-specific extractors
        self._domain_extractors = {
            "github.com": self._extract_github_content,
            "www.github.com": self._extract_github_content,
        }

    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Process bookmark/URL content.

        Args:
            file_path: Can be a URL string or path to .url file
            workspace_id: Workspace UUID
            knowledge_id: Optional knowledge UUID
            **kwargs: Additional options (url, content, etc.)

        Returns:
            ProcessorResult with extracted content
        """
        result = ProcessorResult(success=False)

        # Get URL - either from kwargs or file
        url = kwargs.get("url")
        if not url:
            # Try to read URL from file
            url = await self._read_url_from_file(file_path)

        if not url:
            result.error = "No URL provided"
            return result

        try:
            # Extract content from URL
            content, title, description = await self._extract_url_content(url)

            if content:
                result.success = True
                result.content = content[:self._BOOKMARK_CONTENT_MAX_CHARS]
                result.extracted_text = result.content
                result.metadata = {
                    "url": url,
                    "title": title,
                    "description": description,
                }

                # Store AI-relevant fields
                if title:
                    result.ai_title = title
                if description:
                    result.ai_description = description

                # Embed if knowledge_id provided
                if knowledge_id:
                    await self._embed_content(
                        content=result.content,
                        knowledge_id=knowledge_id,
                        workspace_id=workspace_id,
                        title=title,
                    )
                    result.embedded = True
            else:
                result.error = "Failed to extract content from URL"

        except Exception as e:
            logger.exception(f"Error processing bookmark {url}: {e}")
            result.error = str(e)

        return result

    async def _read_url_from_file(self, file_path: str) -> Optional[str]:
        """Read URL from a .url or text file."""
        try:
            from pathlib import Path
            path = Path(file_path)

            if not path.exists():
                # Maybe it's already a URL
                if file_path.startswith(("http://", "https://")):
                    return file_path
                return None

            content = path.read_text(encoding="utf-8", errors="replace")

            # Windows .url format
            url_match = re.search(r"URL=(.+)", content)
            if url_match:
                return url_match.group(1).strip()

            # Plain URL
            url_match = re.search(r"https?://[^\s<>]+", content)
            if url_match:
                return url_match.group(0)

            return None

        except Exception as e:
            logger.debug(f"Could not read URL from file: {e}")
            return None

    async def _extract_url_content(self, url: str) -> tuple[str, Optional[str], Optional[str]]:
        """
        Extract content from URL using multiple strategies.

        Returns:
            Tuple of (content, title, description)
        """
        import httpx

        title = None
        description = None

        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://github.com/openforge)"
            },
        ) as client:
            # Try domain-specific extractor
            domain = self._get_domain(url)
            domain_content = ""
            if domain in self._domain_extractors:
                try:
                    domain_content = await self._domain_extractors[domain](client, url)
                except Exception as e:
                    logger.debug(f"Domain extractor failed for {url}: {e}")

            # Try raw markdown file
            raw_markdown = await self._try_fetch_raw_markdown(client, url)

            # Try fetching HTML
            html_content = await self._try_fetch_html(client, url)

            # Extract metadata from HTML
            if html_content:
                title, description = self._extract_metadata_from_html(html_content)

            # Convert HTML to markdown
            html_markdown = self._convert_html_to_markdown(html_content) if html_content else ""

            # Check for bot challenge
            if self._looks_like_bot_challenge(html_markdown):
                html_markdown = ""

            # Try Jina Reader if other methods failed
            jina_markdown = ""
            if not any([domain_content, raw_markdown, html_markdown]):
                try:
                    jina_markdown = await self._try_jina_reader(url)
                except Exception as e:
                    logger.debug(f"Jina Reader failed: {e}")

            # Build metadata fallback
            metadata_fallback = self._build_metadata_fallback(title, description)

            # Pick best content
            candidates = [
                ("domain_extractor", domain_content),
                ("raw_markdown", raw_markdown),
                ("html_to_markdown", html_markdown),
                ("jina_reader", jina_markdown),
                ("metadata_fallback", metadata_fallback),
            ]

            strategy, content = self._pick_best_content(candidates)

            if content:
                logger.info(f"Extracted bookmark content via {strategy} from {url}")
            else:
                logger.warning(f"Failed to extract content from {url}")

            return content, title, description

    def _get_domain(self, url: str) -> str:
        """Extract domain from URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc.lower()
        except Exception:
            return ""

    async def _try_fetch_html(self, client: httpx.AsyncClient, url: str) -> str:
        """Fetch HTML content from URL."""
        try:
            response = await client.get(url)
            if response.status_code == 200:
                return response.text
        except Exception as e:
            logger.debug(f"Failed to fetch HTML: {e}")
        return ""

    async def _try_fetch_raw_markdown(self, client: httpx.AsyncClient, url: str) -> str:
        """Try to fetch raw markdown file from GitHub/GitLab."""
        # Check if it's a GitHub/GitLab raw URL or convertible
        if "github.com" in url and "/blob/" in url:
            raw_url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
            try:
                response = await client.get(raw_url)
                if response.status_code == 200:
                    return response.text
            except Exception:
                pass
        return ""

    async def _try_jina_reader(self, url: str) -> str:
        """Try Jina Reader API for content extraction."""
        try:
            import httpx
            jina_url = f"https://r.jina.ai/{url}"
            async with httpx.AsyncClient(timeout=self._JINA_READER_TIMEOUT_SECONDS) as client:
                response = await client.get(jina_url)
                if response.status_code == 200:
                    return response.text
        except Exception as e:
            logger.debug(f"Jina Reader failed: {e}")
        return ""

    async def _extract_github_content(self, client: httpx.AsyncClient, url: str) -> str:
        """Extract content from GitHub URLs."""
        # Try raw content for files
        if "/blob/" in url:
            raw_url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
            try:
                response = await client.get(raw_url)
                if response.status_code == 200:
                    return response.text
            except Exception:
                pass

        # Try README for repos
        if not any(x in url for x in ["/blob/", "/tree/", "/issues/", "/pull/"]):
            for readme in ["README.md", "readme.md", "README", "readme"]:
                raw_url = url.rstrip("/") + f"/main/{readme}"
                raw_url = raw_url.replace("github.com", "raw.githubusercontent.com")
                try:
                    response = await client.get(raw_url)
                    if response.status_code == 200:
                        return response.text
                except Exception:
                    continue

        return ""

    def _extract_metadata_from_html(self, html: str) -> tuple[Optional[str], Optional[str]]:
        """Extract title and description from HTML."""
        if not html:
            return None, None

        title = None
        description = None

        # Title
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if title_match:
            title = self._clean_html(title_match.group(1))

        # Description - try multiple meta tags
        desc_patterns = [
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
        ]

        for pattern in desc_patterns:
            desc_match = re.search(pattern, html, re.IGNORECASE)
            if desc_match:
                description = self._clean_html(desc_match.group(1))
                break

        return title, description

    def _convert_html_to_markdown(self, html: str) -> str:
        """Convert HTML to simple markdown."""
        if not html:
            return ""

        # Remove script, style, etc.
        markdown = re.sub(
            r"(?is)<(script|style|noscript|svg|canvas|iframe)[^>]*>.*?</\1>",
            "",
            html,
        )

        # Headers
        for i in range(6, 0, -1):
            markdown = re.sub(
                rf"<h{i}[^>]*>(.*?)</h{i}>",
                lambda m: f"\n{'#' * i} {self._clean_html(m.group(1))}\n",
                markdown,
                flags=re.IGNORECASE | re.DOTALL,
            )

        # Paragraphs
        markdown = re.sub(r"<p[^>]*>(.*?)</p>", r"\n\1\n", markdown, flags=re.IGNORECASE | re.DOTALL)

        # Links
        markdown = re.sub(
            r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
            r"[\2](\1)",
            markdown,
            flags=re.IGNORECASE | re.DOTALL,
        )

        # Bold/strong
        markdown = re.sub(r"<(strong|b)[^>]*>(.*?)</\1>", r"**\2**", markdown, flags=re.IGNORECASE | re.DOTALL)

        # Italic/em
        markdown = re.sub(r"<(em|i)[^>]*>(.*?)</\1>", r"*\2*", markdown, flags=re.IGNORECASE | re.DOTALL)

        # Code blocks
        markdown = re.sub(r"<pre[^>]*>(.*?)</pre>", r"\n```\n\1\n```\n", markdown, flags=re.IGNORECASE | re.DOTALL)

        # Inline code
        markdown = re.sub(r"<code[^>]*>(.*?)</code>", r"`\1`", markdown, flags=re.IGNORECASE | re.DOTALL)

        # Lists
        markdown = re.sub(r"<li[^>]*>(.*?)</li>", r"- \1\n", markdown, flags=re.IGNORECASE | re.DOTALL)

        # Remove remaining tags
        markdown = re.sub(r"<[^>]+>", " ", markdown)

        # Clean up
        markdown = unescape(markdown)
        markdown = re.sub(r"\s+", " ", markdown).strip()

        return markdown[:self._BOOKMARK_CONTENT_MAX_CHARS]

    def _clean_html(self, text: str) -> str:
        """Clean HTML from text."""
        if not text:
            return ""
        cleaned = re.sub(r"<[^>]+>", " ", text)
        cleaned = unescape(cleaned)
        return re.sub(r"\s+", " ", cleaned).strip()

    def _looks_like_bot_challenge(self, text: str) -> bool:
        """Check if content looks like a bot challenge page."""
        if not text:
            return False

        challenge_indicators = [
            "enable javascript",
            "checking your browser",
            "please wait",
            "are you a robot",
            "cloudflare",
            "ddos protection",
            "security check",
        ]

        text_lower = text.lower()
        matches = sum(1 for indicator in challenge_indicators if indicator in text_lower)
        return matches >= 2

    def _build_metadata_fallback(
        self, title: Optional[str], description: Optional[str]
    ) -> str:
        """Build fallback content from metadata."""
        parts = []
        if title:
            parts.append(f"# {title}")
        if description:
            parts.append(description)
        return "\n\n".join(parts)

    def _pick_best_content(self, candidates: list[tuple[str, str]]) -> tuple[str, str]:
        """Pick the best content from candidates."""
        for strategy, content in candidates:
            if content and len(content.strip()) > 100:
                return strategy, content

        # Return first non-empty
        for strategy, content in candidates:
            if content and content.strip():
                return strategy, content

        return "none", ""

    async def _embed_content(
        self,
        content: str,
        knowledge_id: UUID,
        workspace_id: UUID,
        title: Optional[str] = None,
    ) -> None:
        """Embed bookmark content in vector store."""
        try:
            from openforge.core.knowledge_processor import knowledge_processor

            await knowledge_processor.process_knowledge(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                content=content,
                knowledge_type="bookmark",
                title=title,
                tags=[],
            )
        except Exception as e:
            logger.error(f"Failed to embed bookmark content: {e}")
