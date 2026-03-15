"""Handoff executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class HandoffNodeExecutor(BaseNodeExecutor):
    """Record an explicit handoff in parent state."""

    supported_types = ("handoff",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        state["handoff"] = {
            "target_node_key": config.get("target_node_key"),
            "target_profile_id": config.get("target_profile_id"),
            "target_workflow_id": config.get("target_workflow_id"),
            "reason": config.get("handoff_reason"),
        }
        return NodeExecutionResult(state=state, next_edge_type=config.get("edge_type", "success"))
