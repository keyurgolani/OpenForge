"""Delegate-call executor.

Spawns a bounded child run and merges the result back with merge audit
tracking for delegation and composition.
"""

from __future__ import annotations

from uuid import UUID

from openforge.db.models import RunModel
from openforge.runtime.composite_types import INTERRUPTING_CHILD_STATUSES, build_composite_metadata
from openforge.runtime.merge_engine import build_merge_metadata, merge_child_output
from openforge.runtime.state_transfer import map_state_fields, validate_child_output, validate_merge_safety

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionError, NodeExecutionResult


def _parse_uuid(value: str | UUID | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


class DelegateCallNodeExecutor(BaseNodeExecutor):
    """Spawn a bounded child run and merge the result back into parent state."""

    supported_types = ("delegate_call",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        state_key = config.get("state_key", "delegated_child_run_id")
        child_run_id = _parse_uuid(state.get(state_key))
        spawned_run_ids: list[UUID] = []

        if child_run_id is None:
            child_input = map_state_fields(state, config.get("input_mapping") or context.node.get("input_mapping"))

            composite_meta = build_composite_metadata(
                origin_node_key=context.node.get("node_key"),
                delegation_mode="call",
            )

            child_run_id = await context.coordinator.execute_workflow(
                workflow_id=_parse_uuid(config.get("child_workflow_id") or config.get("workflow_id")),
                workflow_version_id=_parse_uuid(config.get("workflow_version_id")),
                input_payload=child_input,
                workspace_id=context.run.workspace_id,
                parent_run_id=context.run.id,
                spawned_by_step_id=context.step_id,
                delegation_mode=config.get("delegation_mode", "call"),
                merge_strategy=config.get("merge_strategy", "direct"),
                join_group_id=config.get("join_group_id"),
                branch_key=config.get("branch_key"),
                branch_index=config.get("branch_index"),
                handoff_reason=config.get("handoff_reason"),
                composite_metadata=composite_meta,
            )
            spawned_run_ids.append(child_run_id)
            state[state_key] = str(child_run_id)

        child_run = await context.coordinator.db.get(RunModel, child_run_id)
        if child_run is None:
            raise NodeExecutionError("Delegated child run was not found", code="missing_child_run")

        if child_run.status in INTERRUPTING_CHILD_STATUSES:
            return NodeExecutionResult(
                state=state,
                interrupt=True,
                interrupt_status=child_run.status,
                spawned_run_id=child_run_id,
                spawned_run_ids=spawned_run_ids,
            )

        if child_run.status == "failed":
            raise NodeExecutionError("Delegated child run failed", code="child_run_failed")

        child_output = dict(child_run.output_payload or child_run.state_snapshot or {})

        # Validate child output if schema provided
        output_schema = config.get("output_schema")
        if output_schema:
            warnings = validate_child_output(child_output, output_schema)
            if warnings:
                state.setdefault("__validation_warnings__", []).extend(warnings)

        # Check merge safety
        merge_strategy = config.get("merge_strategy")
        output_mapping = config.get("output_mapping") or context.node.get("output_mapping")
        safety_warnings = validate_merge_safety(
            state, child_output, output_mapping, strategy=merge_strategy or "direct"
        )
        if safety_warnings:
            state.setdefault("__validation_warnings__", []).extend(safety_warnings)

        # Merge with audit metadata
        meta = build_merge_metadata(
            child_run_id=str(child_run_id),
            delegation_mode="call",
            node_key=context.node.get("node_key"),
        )
        merged = merge_child_output(
            state,
            child_output,
            output_mapping,
            strategy=merge_strategy,
            merge_metadata=meta,
        )
        return NodeExecutionResult(
            state=merged,
            output=child_output,
            spawned_run_id=child_run_id,
            spawned_run_ids=spawned_run_ids,
        )
