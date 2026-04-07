"""browser.close_tab — Close a browser tab."""

from __future__ import annotations

from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient


class BrowserCloseTabTool(BaseTool):
    """Close a browser tab by its tab ID."""

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.close_tab"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Close Browser Tab"

    @property
    def description(self) -> str:
        return "Close a browser tab by its tab ID."

    @property
    def risk_level(self) -> str:
        return "medium"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "tab_id": {
                    "type": "string",
                    "description": "ID of the tab to close",
                },
            },
            "required": ["tab_id"],
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        tab_id: str = params["tab_id"]

        try:
            result = await self._client.close_tab(tab_id)
            return ToolResult(success=True, output=result)
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Failed to close tab: {exc}",
                recovery_hints=[
                    "Ensure the tab_id is valid — use browser.list_tabs to see open tabs",
                ],
            )
