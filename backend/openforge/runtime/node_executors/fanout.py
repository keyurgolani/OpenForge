"""Fanout executor."""

from __future__ import annotations

from uuid import UUID

from openforge.db.models import RunModel
from openforge.runtime.composite_types import INTERRUPTING_CHILD_STATUSES
from openforge.runtime.state_transfer import map_state_fields

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionError, NodeExecutionResult


def _as_uuid(value: str | UUID | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


class FanoutNodeExecutor(BaseNodeExecutor):
    """Spawn multiple child runs from a single parent step."""

    supported_types = ("fanout",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        state_key = config.get("state_key", "fanout_branches")
        join_group_id = config.get("join_group_id")
        branches = list(state.get(state_key) or [])
        spawned_run_ids: list[UUID] = []

        if not branches:
            items = list(state.get(config.get("fanout_items_key") or config.get("fanout_source"), []) or [])
            for index, item in enumerate(items):
                child_input = map_state_fields(
                    state,
                    config.get("input_mapping") or context.node.get("input_mapping"),
                    extra_context={"item": item, "item_index": index},
                )
                child_run_id = await context.coordinator.execute_workflow(
                    workflow_id=_as_uuid(config.get("child_workflow_id")),
                    workflow_version_id=_as_uuid(config.get("workflow_version_id")),
                    input_payload=child_input,
                    workspace_id=context.run.workspace_id,
                    parent_run_id=context.run.id,
                    spawned_by_step_id=context.step_id,
                    delegation_mode=config.get("delegation_mode", "fanout"),
                    join_group_id=join_group_id,
                    branch_key=str(item),
                    branch_index=index,
                    composite_metadata={"origin_node_key": context.node.get("node_key")},
                )
                spawned_run_ids.append(child_run_id)
                child_run = await context.coordinator.db.get(RunModel, child_run_id)
                if child_run is None:
                    raise NodeExecutionError("Fanout child run was not found", code="missing_child_run")
                branches.append(
                    {
                        "child_run_id": str(child_run_id),
                        "join_group_id": join_group_id,
                        "branch_key": str(item),
                        "branch_index": index,
                        "status": child_run.status,
                        "output": dict(child_run.output_payload or child_run.state_snapshot or {}),
                    }
                )
            state[state_key] = branches
            state.setdefault("__branch_groups__", {})[join_group_id] = state_key

        unresolved = [branch for branch in branches if branch.get("status") in INTERRUPTING_CHILD_STATUSES]
        if unresolved:
            return NodeExecutionResult(
                state=state,
                interrupt=True,
                interrupt_status=unresolved[0]["status"],
                spawned_run_ids=spawned_run_ids,
            )

        failures = [branch for branch in branches if branch.get("status") == "failed"]
        if failures and config.get("failure_mode", "fail_parent") == "fail_parent":
            raise NodeExecutionError("At least one fanout branch failed", code="fanout_branch_failed")

        return NodeExecutionResult(state=state, spawned_run_ids=spawned_run_ids)
