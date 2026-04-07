"""browser.extract_text — Extract clean text content from the current page."""

from __future__ import annotations

from content_boundary import wrap_untrusted
from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient

_MAX_CHARS = 80_000


class BrowserExtractTextTool(BaseTool):
    """Extract readable text from the currently open browser page.

    Returns ~800 tokens of clean text content, suitable for LLM consumption.
    Uses the PinchTab snapshot and strips element refs to produce prose.
    """

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.extract_text"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Extract Page Text"

    @property
    def description(self) -> str:
        return (
            "Extract clean text content (~800 tokens) from the current browser page. "
            "Use this after browser.open to get readable text without element refs."
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
                    "description": "Tab to extract text from. Defaults to the active tab.",
                },
                "max_chars": {
                    "type": "integer",
                    "default": 8000,
                    "description": "Maximum characters to return (max 80000)",
                },
            },
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        tab_id: str | None = params.get("tab_id")
        max_chars = min(params.get("max_chars", 8000), _MAX_CHARS)

        try:
            result = await self._client.evaluate(
                "document.body.innerText"
            )
            text = str(result.get("result", result.get("value", "")))
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Text extraction failed: {exc}",
                recovery_hints=[
                    "Ensure a page is open via browser.open",
                    "Try web.read_page for content extraction without a browser session",
                ],
            )

        if not text or len(text.strip()) < 10:
            return ToolResult(
                success=True,
                output="Page has minimal text content.",
                recovery_hints=["Try browser.snapshot for the full page structure"],
            )

        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n[... truncated]"

        return ToolResult(
            success=True,
            output=wrap_untrusted(text, "browser page text"),
        )
