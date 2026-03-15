"""Join executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class JoinNodeExecutor(BaseNodeExecutor):
    """Normalize branch outputs into a single collection."""

    supported_types = ("join",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        join_group_id = config.get("join_group_id")
        branch_groups = state.get("__branch_groups__", {})
        state_key = branch_groups.get(join_group_id, config.get("state_key", "fanout_branches"))
        branches = list(state.get(state_key, []) or [])
        output_key = config.get("output_key", "joined_branches")
        state[output_key] = [branch.get("output", {}) for branch in branches]
        return NodeExecutionResult(state=state, output={output_key: state[output_key]})
