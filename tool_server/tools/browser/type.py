"""browser.type — Type text into an element by ref."""

from __future__ import annotations

from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient


class BrowserTypeTool(BaseTool):
    """Type text into an element identified by a ref from a prior browser.snapshot."""

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.type"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Type Text"

    @property
    def description(self) -> str:
        return (
            "Type text into an input element on the page by its ref from a prior "
            "snapshot. Use browser.snapshot first to get element references."
        )

    @property
    def risk_level(self) -> str:
        return "medium"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "ref": {
                    "type": "string",
                    "description": "Element reference from a prior browser.snapshot",
                },
                "text": {
                    "type": "string",
                    "description": "Text to type into the element",
                },
            },
            "required": ["ref", "text"],
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        ref: str = params["ref"]
        text: str = params["text"]

        try:
            result = await self._client.type_text(ref, text)
            return ToolResult(success=True, output=result)
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Type failed: {exc}",
                recovery_hints=[
                    "Ensure the ref is from a recent browser.snapshot",
                    "Try browser.snapshot to get updated element references",
                    "Try web.read_page if you only need text content",
                ],
            )
