"""Router node executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class RouterNodeExecutor(BaseNodeExecutor):
    """Simple state-based router."""

    supported_types = ("router",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        config = context.node.get("config", {})
        state = dict(context.state)
        for route in config.get("routes", []):
            state_key = route.get("state_key")
            expected_value = route.get("equals")
            if state.get(state_key) == expected_value:
                return NodeExecutionResult(state=state, next_edge_type=route.get("edge_type", "success"))
        return NodeExecutionResult(state=state, next_edge_type=config.get("default_edge_type", "success"))
