"""Fanout executor.

Spawns multiple child runs from a single parent step with configurable
failure handling and branch-level retry tracking for composite workflow execution.
"""

from __future__ import annotations

import logging
from uuid import UUID

from openforge.db.models import RunModel
from openforge.runtime.composite_types import (
    FAILED_CHILD_STATUSES,
    INTERRUPTING_CHILD_STATUSES,
    ChildFailureMode,
    build_composite_metadata,
)
from openforge.runtime.state_transfer import map_state_fields

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionError, NodeExecutionResult

logger = logging.getLogger("openforge.runtime.node_executors.fanout")


def _as_uuid(value: str | UUID | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


class FanoutNodeExecutor(BaseNodeExecutor):
    """Spawn multiple child runs from a single parent step.

    Supports configurable failure modes:
    * ``fail_parent`` (default) -- fail immediately if any child fails
    * ``ignore`` -- continue despite child failures
    * ``collect_and_continue`` -- collect failures and proceed to join/reduce
    * ``retry_branch`` -- retry failed branches up to max_retries
    * ``require_intervention`` -- interrupt for manual intervention on failure
    """

    supported_types = ("fanout",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        state_key = config.get("state_key", "fanout_branches")
        join_group_id = config.get("join_group_id")
        failure_mode = config.get("failure_mode", ChildFailureMode.FAIL_PARENT)
        max_branch_retries = config.get("max_branch_retries", 0)
        branches = list(state.get(state_key) or [])
        spawned_run_ids: list[UUID] = []

        if not branches:
            items = list(
                state.get(config.get("fanout_items_key") or config.get("fanout_source"), []) or []
            )
            for index, item in enumerate(items):
                child_input = map_state_fields(
                    state,
                    config.get("input_mapping") or context.node.get("input_mapping"),
                    extra_context={"item": item, "item_index": index},
                )
                composite_meta = build_composite_metadata(
                    origin_node_key=context.node.get("node_key"),
                    delegation_mode="fanout",
                    failure_mode=failure_mode,
                    branch_count=len(items),
                )
                child_run_id = await context.coordinator.execute_workflow(
                    workflow_id=_as_uuid(config.get("child_workflow_id")),
                    workflow_version_id=_as_uuid(config.get("workflow_version_id")),
                    input_payload=child_input,
                    workspace_id=context.run.workspace_id,
                    parent_run_id=context.run.id,
                    spawned_by_step_id=context.step_id,
                    delegation_mode="fanout",
                    join_group_id=join_group_id,
                    branch_key=str(item),
                    branch_index=index,
                    composite_metadata=composite_meta,
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
                        "retry_count": 0,
                    }
                )
            state[state_key] = branches
            state.setdefault("__branch_groups__", {})[join_group_id] = state_key

        # Check for interrupting children
        unresolved = [b for b in branches if b.get("status") in INTERRUPTING_CHILD_STATUSES]
        if unresolved:
            return NodeExecutionResult(
                state=state,
                interrupt=True,
                interrupt_status=unresolved[0]["status"],
                spawned_run_ids=spawned_run_ids,
            )

        # Handle failed children based on failure_mode
        failures = [b for b in branches if b.get("status") in FAILED_CHILD_STATUSES]
        if failures:
            return self._handle_failures(
                state, failures, branches, failure_mode, max_branch_retries, spawned_run_ids
            )

        return NodeExecutionResult(state=state, spawned_run_ids=spawned_run_ids)

    def _handle_failures(
        self,
        state: dict,
        failures: list[dict],
        branches: list[dict],
        failure_mode: str,
        max_branch_retries: int,
        spawned_run_ids: list[UUID],
    ) -> NodeExecutionResult:
        """Handle failed branches according to configured failure mode."""

        if failure_mode == ChildFailureMode.FAIL_PARENT:
            raise NodeExecutionError(
                f"{len(failures)} of {len(branches)} fanout branches failed",
                code="fanout_branch_failed",
            )

        if failure_mode == ChildFailureMode.IGNORE:
            logger.warning("Ignoring %d failed fanout branches (failure_mode=ignore)", len(failures))
            return NodeExecutionResult(state=state, spawned_run_ids=spawned_run_ids)

        if failure_mode == ChildFailureMode.COLLECT_AND_CONTINUE:
            # Mark failures in state for downstream join/reduce to handle
            state["__fanout_failures__"] = [
                {
                    "branch_key": f.get("branch_key"),
                    "branch_index": f.get("branch_index"),
                    "status": f.get("status"),
                }
                for f in failures
            ]
            return NodeExecutionResult(state=state, spawned_run_ids=spawned_run_ids)

        if failure_mode == ChildFailureMode.RETRY_BRANCH:
            # Check if any failed branch can be retried
            retryable = [
                f for f in failures
                if (f.get("retry_count") or 0) < max_branch_retries
            ]
            if retryable:
                for branch in retryable:
                    branch["retry_count"] = (branch.get("retry_count") or 0) + 1
                    branch["status"] = "retrying"
                logger.info(
                    "Retrying %d failed fanout branches (attempt %d of %d)",
                    len(retryable),
                    retryable[0].get("retry_count", 1),
                    max_branch_retries,
                )
                # Interrupt to allow re-execution
                return NodeExecutionResult(
                    state=state,
                    interrupt=True,
                    interrupt_status="retrying",
                    spawned_run_ids=spawned_run_ids,
                )
            # Exhausted retries
            raise NodeExecutionError(
                f"{len(failures)} fanout branches failed after {max_branch_retries} retries",
                code="fanout_branch_failed",
            )

        if failure_mode == ChildFailureMode.REQUIRE_INTERVENTION:
            state["__intervention_required__"] = {
                "reason": "fanout_branch_failures",
                "failed_branches": len(failures),
                "total_branches": len(branches),
            }
            return NodeExecutionResult(
                state=state,
                interrupt=True,
                interrupt_status="interrupted",
                spawned_run_ids=spawned_run_ids,
            )

        # Default: fail parent
        raise NodeExecutionError(
            f"{len(failures)} fanout branches failed",
            code="fanout_branch_failed",
        )
