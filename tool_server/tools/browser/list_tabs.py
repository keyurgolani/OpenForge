"""browser.list_tabs — List open browser tabs."""

from __future__ import annotations

import json

from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient


class BrowserListTabsTool(BaseTool):
    """List all open PinchTab browser tabs with their IDs, URLs, and titles."""

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.list_tabs"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "List Browser Tabs"

    @property
    def description(self) -> str:
        return (
            "List all open browser tabs with their tab IDs, URLs, and titles."
        )

    @property
    def risk_level(self) -> str:
        return "low"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {},
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            tabs = await self._client.list_tabs()
            return ToolResult(
                success=True,
                output=json.dumps(tabs, ensure_ascii=False),
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Failed to list tabs: {exc}",
                recovery_hints=[
                    "Check that PinchTab sidecar is running",
                    "Try browser.open to start a new session",
                ],
            )
