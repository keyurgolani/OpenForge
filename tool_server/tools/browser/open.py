"""browser.open — Open a URL in the browser and return a page snapshot."""

from __future__ import annotations

import json

from content_boundary import wrap_untrusted
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from tools.web.clients import PinchTabClient


class BrowserOpenTool(BaseTool):
    """Open a URL in the browser. Returns a page snapshot with element refs
    that can be used with browser.click, browser.type, and browser.fill_form.
    """

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.open"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Open Browser"

    @property
    def description(self) -> str:
        return (
            "Open a URL in the browser and return a snapshot of the page structure "
            "with element references. Use the refs with browser.click, browser.type, "
            "and browser.fill_form to interact with the page."
        )

    @property
    def risk_level(self) -> str:
        return "medium"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to open"},
            },
            "required": ["url"],
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url: str = params["url"]
        try:
            security.validate_url(url)
        except ValueError as exc:
            return ToolResult(success=False, error=str(exc))

        try:
            nav_result = await self._client.navigate(url)
            tab_id = nav_result.get("tab_id")
            snap = await self._client.snapshot(tab_id=tab_id)

            output = {
                "tab_id": tab_id,
                "title": nav_result.get("title", ""),
                "url": url,
                "snapshot": snap,
            }
            return ToolResult(
                success=True,
                output=wrap_untrusted(json.dumps(output, ensure_ascii=False), url),
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Navigation failed: {exc}",
                recovery_hints=[
                    "Check if the URL is accessible",
                    "Try web.read_page if you only need text content",
                ],
            )
