"""browser.evaluate — Execute JavaScript in the browser (HITL-gated)."""

from __future__ import annotations

import json

from content_boundary import wrap_untrusted
from protocol import BaseTool, ToolContext, ToolResult
from tools.web.clients import PinchTabClient


class BrowserEvaluateTool(BaseTool):
    """Execute arbitrary JavaScript. risk_level="high" triggers HITL approval
    via the policy engine before execute() is called.
    """

    def __init__(self, pinchtab: PinchTabClient) -> None:
        self._client = pinchtab

    # -- metadata --

    @property
    def id(self) -> str:
        return "browser.evaluate"

    @property
    def category(self) -> str:
        return "browser"

    @property
    def display_name(self) -> str:
        return "Evaluate JavaScript"

    @property
    def description(self) -> str:
        return (
            "Execute JavaScript in the browser. Requires user approval "
            "before execution."
        )

    @property
    def risk_level(self) -> str:
        return "high"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                    "description": "JavaScript to execute",
                },
            },
            "required": ["script"],
        }

    # -- execution --

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        # By the time execute() is called, HITL approval has already been
        # granted by the policy engine (risk_level="high" → REQUIRES_APPROVAL).
        script: str = params["script"]

        if not script.strip():
            return ToolResult(success=False, error="Script cannot be empty")

        try:
            result = await self._client.evaluate(script)
            return ToolResult(
                success=True,
                output=wrap_untrusted(
                    json.dumps(result, ensure_ascii=False), "browser.evaluate"
                ),
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                error=f"JavaScript evaluation failed: {exc}",
                recovery_hints=[
                    "Check script syntax",
                    "Ensure page is loaded via browser.open",
                ],
            )
