"""web.screenshot — Stateless page screenshot via PinchTab."""

from __future__ import annotations

import base64

from protocol import BaseTool, ToolContext, ToolResult
from security import security
from tools.web.clients import PinchTabClient
from tools.web.screenshot_utils import _compress_screenshot, _MAX_SCREENSHOT_BYTES


class WebScreenshotTool(BaseTool):
    """Navigate to a URL, capture a screenshot, and close the tab.

    Stateless — every invocation opens a fresh tab, captures, and tears it
    down so there are zero leaked tabs on success *or* failure.
    """

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._pt = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "web.screenshot"

    @property
    def category(self) -> str:
        return "web"

    @property
    def display_name(self) -> str:
        return "Screenshot Web Page"

    @property
    def description(self) -> str:
        return (
            "Take a screenshot of a web page. Navigates to the URL, captures the "
            "viewport (or full page), and closes the tab. Stateless — for interactive "
            "browsing sessions, use browser.open instead."
        )

    @property
    def risk_level(self) -> str:
        return "low"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to screenshot"},
                "full_page": {
                    "type": "boolean",
                    "default": False,
                    "description": "Capture full scrollable page instead of just the viewport",
                },
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

        full_page: bool = params.get("full_page", False)
        tab_id: str | None = None

        try:
            nav = await self._pt.navigate(url)
            tab_id = nav["tab_id"]

            png_bytes = await self._pt.screenshot(tab_id=tab_id, full_page=full_page)
            jpeg_bytes = _compress_screenshot(png_bytes)

            if len(jpeg_bytes) > _MAX_SCREENSHOT_BYTES:
                return ToolResult(
                    success=False,
                    error=(
                        f"Compressed screenshot exceeds 1 MB "
                        f"({len(jpeg_bytes)} bytes). "
                        "Try without full_page or use web.read_page for text content."
                    ),
                    recovery_hints=[
                        "Retry with full_page=false for viewport-only capture",
                        "Use web.read_page if you only need text content",
                    ],
                )

            b64 = base64.b64encode(jpeg_bytes).decode("ascii")
            return ToolResult(
                success=True,
                output=f"Screenshot captured for {url}",
                images=[{"data": b64, "media_type": "image/jpeg"}],
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Screenshot failed: {exc}",
                recovery_hints=[
                    "Check if the URL is accessible",
                    "Use web.read_page for text content",
                ],
            )
        finally:
            if tab_id is not None:
                try:
                    await self._pt.close_tab(tab_id)
                except Exception:
                    pass  # Best-effort cleanup
