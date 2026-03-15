"""Run and step lifecycle manager with transition validation.

Provides a deterministic state machine for run and step status transitions.
Rejects invalid transitions to prevent inconsistent execution state.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Valid run status transitions
# ---------------------------------------------------------------------------

_VALID_RUN_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"queued", "running", "cancelled", "failed"},
    "queued": {"running", "cancelled", "failed"},
    "running": {
        "completed",
        "failed",
        "cancelled",
        "waiting_approval",
        "interrupted",
        "paused",
        "retrying",
    },
    "waiting_approval": {"running", "cancelled", "failed", "completed"},
    "interrupted": {"running", "cancelled", "failed", "completed"},
    "paused": {"running", "cancelled", "failed"},
    "retrying": {"running", "failed", "cancelled"},
    "completed": set(),  # terminal
    "failed": {"retrying", "running"},  # allow retry from failed
    "cancelled": set(),  # terminal
}

# ---------------------------------------------------------------------------
# Valid step status transitions
# ---------------------------------------------------------------------------

_VALID_STEP_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"running", "skipped", "cancelled"},
    "running": {"completed", "failed", "cancelled", "waiting_approval", "interrupted", "retrying"},
    "waiting_approval": {"running", "completed", "failed", "cancelled"},
    "interrupted": {"running", "completed", "failed", "cancelled"},
    "retrying": {"running", "failed", "cancelled"},
    "completed": set(),  # terminal
    "failed": {"retrying", "running"},  # allow retry
    "cancelled": set(),  # terminal
    "skipped": set(),  # terminal
}

# ---------------------------------------------------------------------------
# Retryable failure classification
# ---------------------------------------------------------------------------

RETRYABLE_ERROR_CODES: set[str] = {
    "llm_timeout",
    "llm_rate_limit",
    "tool_timeout",
    "tool_transient_failure",
    "checkpoint_write_failed",
    "child_run_transient_failure",
}

NON_RETRYABLE_ERROR_CODES: set[str] = {
    "missing_entry_node",
    "node_execution_failed",
    "unsupported_tool_operation",
    "missing_child_run",
    "child_run_failed",
    "fanout_branch_failed",
    "policy_blocked",
    "schema_validation_failed",
    "merge_conflict",
}


class InvalidTransitionError(Exception):
    """Raised when a status transition is not allowed."""

    def __init__(self, entity_type: str, current: str, target: str) -> None:
        super().__init__(
            f"Invalid {entity_type} transition: '{current}' -> '{target}'"
        )
        self.entity_type = entity_type
        self.current_status = current
        self.target_status = target


# ---------------------------------------------------------------------------
# Run lifecycle
# ---------------------------------------------------------------------------


def validate_run_transition(current: str, target: str) -> None:
    """Validate that a run status transition is allowed."""
    allowed = _VALID_RUN_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError("run", current, target)


def transition_run(
    run: Any,
    status: str,
    *,
    error_code: str | None = None,
    error_message: str | None = None,
    validate: bool = True,
) -> None:
    """Apply a run status transition with timestamps and optional validation."""
    if validate and run.status != status:
        validate_run_transition(run.status, status)

    timestamp = now_utc()
    run.status = status

    if status == "running" and run.started_at is None:
        run.started_at = timestamp
    if status == "completed":
        run.completed_at = timestamp
    if status == "cancelled":
        run.cancelled_at = timestamp
    if status == "failed":
        run.completed_at = timestamp

    if error_code is not None:
        run.error_code = error_code
    if error_message is not None:
        run.error_message = error_message


# ---------------------------------------------------------------------------
# Step lifecycle
# ---------------------------------------------------------------------------


def validate_step_transition(current: str, target: str) -> None:
    """Validate that a step status transition is allowed."""
    allowed = _VALID_STEP_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError("step", current, target)


def start_step(step: Any, *, validate: bool = True) -> None:
    """Transition a step to running."""
    if validate and step.status != "running":
        validate_step_transition(step.status, "running")
    timestamp = now_utc()
    step.status = "running"
    step.started_at = timestamp


def finish_step(
    step: Any,
    status: str,
    *,
    error_code: str | None = None,
    error_message: str | None = None,
    validate: bool = True,
) -> None:
    """Transition a step to a terminal or interrupt status."""
    if validate and step.status != status:
        validate_step_transition(step.status, status)
    step.status = status
    step.completed_at = now_utc()
    if error_code is not None:
        step.error_code = error_code
    if error_message is not None:
        step.error_message = error_message


# ---------------------------------------------------------------------------
# Retry helpers
# ---------------------------------------------------------------------------


def is_retryable(error_code: str | None) -> bool:
    """Determine if an error code represents a retryable failure."""
    if error_code is None:
        return False
    return error_code in RETRYABLE_ERROR_CODES


def increment_retry(step: Any) -> int:
    """Increment step retry count and return the new value."""
    current = getattr(step, "retry_count", 0) or 0
    step.retry_count = current + 1
    return step.retry_count


def can_retry_step(step: Any, *, max_retries: int = 3) -> bool:
    """Check if a step can be retried based on error code and retry count."""
    if not is_retryable(getattr(step, "error_code", None)):
        return False
    current = getattr(step, "retry_count", 0) or 0
    return current < max_retries


# ---------------------------------------------------------------------------
# Cancellation propagation
# ---------------------------------------------------------------------------


def should_propagate_cancel(run: Any) -> bool:
    """Check if cancellation should propagate to child runs."""
    return run.status == "cancelled"


def get_terminal_reason(run: Any) -> dict[str, str | None]:
    """Get a structured summary of why a run reached a terminal state."""
    return {
        "status": run.status,
        "error_code": getattr(run, "error_code", None),
        "error_message": getattr(run, "error_message", None),
        "completed_at": str(getattr(run, "completed_at", None)),
        "cancelled_at": str(getattr(run, "cancelled_at", None)),
    }
