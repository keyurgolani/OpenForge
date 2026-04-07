"""HTTP clients for Crawl4AI and PinchTab sidecars."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx


# ── Configuration ──


@dataclass
class Crawl4AIConfig:
    base_url: str = "http://crawl4ai:11235"
    timeout: float = 60.0
    max_content_chars: int = 80_000


@dataclass
class PinchTabConfig:
    base_url: str = "http://pinchtab:3000"
    timeout: float = 30.0
    screenshot_timeout: float = 15.0


# ── Crawl4AI Client ──


class Crawl4AIClient:
    """HTTP client wrapping Crawl4AI sidecar REST API."""

    def __init__(self, config: Crawl4AIConfig) -> None:
        self._config = config

    async def health_check(self) -> bool:
        """Return True if the Crawl4AI sidecar is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._config.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def crawl(
        self,
        url: str,
        *,
        word_count_threshold: int = 10,
        exclude_external_links: bool = True,
    ) -> dict[str, Any]:
        """Crawl a URL and return LLM-optimized markdown.

        Returns ``{markdown, metadata, success}``.
        Content is truncated to ``config.max_content_chars`` when exceeded.
        Raises ``httpx.HTTPStatusError`` on HTTP errors.
        """
        payload = {
            "urls": [url],
            "word_count_threshold": word_count_threshold,
            "exclude_external_links": exclude_external_links,
        }
        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            resp = await client.post(
                f"{self._config.base_url}/crawl",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # Crawl4AI returns results as a list (one entry per URL).
        # Handle both the list format and a legacy singular "result" dict.
        results_list = data.get("results", [])
        if results_list and isinstance(results_list, list):
            first = results_list[0]
        else:
            first = data.get("result", {})

        # The "markdown" field may be a dict (Crawl4AI v2 format with
        # raw_markdown / fit_markdown keys) or a plain string.
        raw_md = first.get("markdown", "")
        if isinstance(raw_md, dict):
            raw_md = raw_md.get("raw_markdown", "")

        result: dict[str, Any] = {
            "success": first.get("success", data.get("success", False)),
            "markdown": raw_md or "",
            "metadata": first.get("metadata", {}),
        }

        # Truncate if content exceeds configured limit
        md = result["markdown"]
        if len(md) > self._config.max_content_chars:
            result["markdown"] = md[: self._config.max_content_chars]

        return result


# ── PinchTab Client ──


class PinchTabClient:
    """HTTP client wrapping PinchTab sidecar API."""

    def __init__(self, config: PinchTabConfig) -> None:
        self._config = config

    # -- helpers --

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout or self._config.timeout)

    async def _post(self, path: str, json: dict | None = None, *, timeout: float | None = None) -> dict[str, Any]:
        async with self._client(timeout) as client:
            resp = await client.post(f"{self._config.base_url}{path}", json=json or {})
            resp.raise_for_status()
            return resp.json()

    async def _get(self, path: str, *, timeout: float | None = None) -> dict[str, Any]:
        async with self._client(timeout) as client:
            resp = await client.get(f"{self._config.base_url}{path}")
            resp.raise_for_status()
            return resp.json()

    # -- public API --

    async def health_check(self) -> bool:
        """Return True if the PinchTab sidecar is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._config.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def navigate(self, url: str) -> dict[str, Any]:
        """Navigate to *url* in a new tab.

        Returns ``{tab_id, url, title}``.
        """
        return await self._post("/api/navigate", {"url": url})

    async def snapshot(self, tab_id: Optional[str] = None) -> dict[str, Any]:
        """Return compact page structure with element refs.

        If *tab_id* is ``None``, snapshots the currently active tab.
        """
        payload: dict[str, Any] = {}
        if tab_id is not None:
            payload["tab_id"] = tab_id
        return await self._post("/api/snapshot", payload)

    async def click(self, ref: str) -> dict[str, Any]:
        """Click the element identified by *ref*."""
        return await self._post("/api/click", {"ref": ref})

    async def type_text(self, ref: str, text: str) -> dict[str, Any]:
        """Type *text* into the element identified by *ref*."""
        return await self._post("/api/type", {"ref": ref, "text": text})

    async def fill_form(self, fields: dict[str, str]) -> dict[str, Any]:
        """Fill multiple form fields at once."""
        return await self._post("/api/fill_form", {"fields": fields})

    async def screenshot(
        self, tab_id: Optional[str] = None, full_page: bool = False
    ) -> bytes:
        """Capture a PNG screenshot.

        Returns raw PNG bytes.
        """
        payload: dict[str, Any] = {"full_page": full_page}
        if tab_id is not None:
            payload["tab_id"] = tab_id
        async with self._client(self._config.screenshot_timeout) as client:
            resp = await client.post(
                f"{self._config.base_url}/api/screenshot",
                json=payload,
            )
            resp.raise_for_status()
            return resp.content

    async def evaluate(self, script: str) -> dict[str, Any]:
        """Execute JavaScript in the browser and return the result."""
        return await self._post("/api/evaluate", {"script": script})

    async def list_tabs(self) -> list[dict[str, Any]]:
        """Return a list of open tabs ``[{tab_id, url, title}]``."""
        data = await self._get("/api/tabs")
        # Normalise: the API may return the list directly or under a key
        if isinstance(data, list):
            return data
        return data.get("tabs", [])

    async def close_tab(self, tab_id: str) -> dict[str, Any]:
        """Close the tab identified by *tab_id*."""
        return await self._post("/api/close_tab", {"tab_id": tab_id})
