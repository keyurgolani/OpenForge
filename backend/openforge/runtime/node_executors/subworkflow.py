"""Subworkflow node executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class SubworkflowNodeExecutor(BaseNodeExecutor):
    """Spawn a child workflow run through the coordinator."""

    supported_types = ("subworkflow",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {})
        child_run_id = await context.coordinator.execute_workflow(
            workflow_id=config["workflow_id"],
            workflow_version_id=config.get("workflow_version_id"),
            input_payload=state,
            workspace_id=context.run.workspace_id,
            parent_run_id=context.run.id,
            spawned_by_step_id=context.step_id,
        )
        state[config.get("state_key", "child_run_id")] = str(child_run_id)
        return NodeExecutionResult(state=state, spawned_run_id=child_run_id, next_edge_type="success")
