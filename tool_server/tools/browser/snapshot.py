"""browser.snapshot — Get current page structure with optional screenshot."""

from __future__ import annotations

import base64
import json
import logging

from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient
from tools.web.screenshot_utils import _compress_screenshot, _MAX_SCREENSHOT_BYTES

logger = logging.getLogger(__name__)


class BrowserSnapshotTool(BaseTool):
    """Return the current page structure with element refs for interaction.

    Optionally includes a JPEG screenshot alongside the text snapshot.
    Screenshot failure is non-fatal — the text snapshot is always returned.
    """

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.snapshot"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Page Snapshot"

    @property
    def description(self) -> str:
        return (
            "Get the current page structure with element references. "
            "Optionally include a visual screenshot. Use the element refs "
            "with browser.click, browser.type, and browser.fill_form."
        )

    @property
    def risk_level(self) -> str:
        return "low"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "tab_id": {
                    "type": "string",
                    "description": "Tab to snapshot. Defaults to the active tab.",
                },
                "include_screenshot": {
                    "type": "boolean",
                    "default": False,
                    "description": "Attach a JPEG screenshot alongside the text snapshot",
                },
            },
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        tab_id: str | None = params.get("tab_id")
        include_screenshot: bool = params.get("include_screenshot", False)

        try:
            snap = await self._client.snapshot(tab_id=tab_id)
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Snapshot failed: {exc}",
                recovery_hints=[
                    "Ensure a page is open via browser.open",
                    "Try web.read_page if you only need text content",
                ],
            )

        output = json.dumps(snap, ensure_ascii=False)
        images: list[dict] | None = None

        if include_screenshot:
            try:
                png_bytes = await self._client.screenshot(tab_id=tab_id)
                jpeg_bytes = _compress_screenshot(png_bytes)
                if len(jpeg_bytes) <= _MAX_SCREENSHOT_BYTES:
                    b64 = base64.b64encode(jpeg_bytes).decode("ascii")
                    images = [{"data": b64, "media_type": "image/jpeg"}]
                else:
                    logger.warning(
                        "Screenshot exceeded 1 MB (%d bytes), omitting",
                        len(jpeg_bytes),
                    )
            except Exception:
                logger.debug("Screenshot capture failed, returning text-only snapshot", exc_info=True)

        return ToolResult(success=True, output=output, images=images)
