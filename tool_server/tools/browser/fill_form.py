"""browser.fill_form — Fill multiple form fields at once."""

from __future__ import annotations

from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient


class BrowserFillFormTool(BaseTool):
    """Fill multiple form fields at once using a field-ref-to-value mapping."""

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.fill_form"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Fill Form"

    @property
    def description(self) -> str:
        return (
            "Fill multiple form fields at once. Provide a mapping of element refs "
            "to values. Use browser.snapshot first to get element references."
        )

    @property
    def risk_level(self) -> str:
        return "medium"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "fields": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                    "description": "Mapping of element refs to values to fill",
                },
            },
            "required": ["fields"],
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        fields: dict[str, str] = params["fields"]

        if not fields:
            return ToolResult(success=False, error="No fields provided.")

        try:
            result = await self._client.fill_form(fields)
            return ToolResult(success=True, output=result)
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"Fill form failed: {exc}",
                recovery_hints=[
                    "Ensure the refs are from a recent browser.snapshot",
                    "Try browser.snapshot to get updated element references",
                    "Try browser.type to fill fields individually",
                ],
            )
