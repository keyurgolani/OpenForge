"""browser.click — Click an element by ref from a prior snapshot."""

from __future__ import annotations

from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient


class BrowserClickTool(BaseTool):
    """Click an element identified by a ref from a prior browser.snapshot."""

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.click"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Click Element"

    @property
    def description(self) -> str:
        return (
            "Click an element on the page by its ref from a prior snapshot. "
            "Use browser.snapshot first to get element references."
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
            },
            "required": ["ref"],
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        ref: str = params["ref"]

        try:
            result = await self._client.click(ref)
            return ToolResult(success=True, output=result)
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Click failed: {exc}",
                recovery_hints=[
                    "Ensure the ref is from a recent browser.snapshot",
                    "Try browser.snapshot to get updated element references",
                    "Try web.read_page if you only need text content",
                ],
            )
