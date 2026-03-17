"""Composite workflow runtime types and constants."""

from __future__ import annotations

from enum import Enum
from typing import Any


class DelegationMode(str, Enum):
    CALL = "call"
    HANDOFF = "handoff"
    SUBWORKFLOW = "subworkflow"
    FANOUT = "fanout"
    JOIN = "join"
    REDUCE = "reduce"


class ChildFailureMode(str, Enum):
    """Defines how a parent reacts when a child run fails."""

    FAIL_PARENT = "fail_parent"
    IGNORE = "ignore"
    COLLECT_AND_CONTINUE = "collect_and_continue"
    RETRY_BRANCH = "retry_branch"
    REQUIRE_INTERVENTION = "require_intervention"


class JoinCompletionMode(str, Enum):
    """Defines join behavior under partial completion."""

    WAIT_ALL = "wait_all"
    WAIT_SUCCESSFUL = "wait_successful"
    WAIT_MAJORITY = "wait_majority"
    BEST_EFFORT = "best_effort"


TERMINAL_CHILD_STATUSES = {"completed", "failed", "cancelled", "waiting_approval", "interrupted"}
SUCCESSFUL_CHILD_STATUSES = {"completed"}
INTERRUPTING_CHILD_STATUSES = {"waiting_approval", "interrupted"}
FAILED_CHILD_STATUSES = {"failed"}


def build_composite_metadata(
    *,
    origin_node_key: str | None = None,
    delegation_mode: str | None = None,
    failure_mode: str | None = None,
    join_completion_mode: str | None = None,
    branch_count: int | None = None,
    retry_counts: dict[str, int] | None = None,
    merge_decisions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a rich composite_metadata dict for run/step records."""
    meta: dict[str, Any] = {}
    if origin_node_key:
        meta["origin_node_key"] = origin_node_key
    if delegation_mode:
        meta["delegation_mode"] = delegation_mode
    if failure_mode:
        meta["failure_mode"] = failure_mode
    if join_completion_mode:
        meta["join_completion_mode"] = join_completion_mode
    if branch_count is not None:
        meta["branch_count"] = branch_count
    if retry_counts:
        meta["retry_counts"] = retry_counts
    if merge_decisions:
        meta["merge_decisions"] = merge_decisions
    return meta
