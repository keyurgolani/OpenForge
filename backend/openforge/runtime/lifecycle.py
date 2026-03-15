"""Run and step lifecycle helpers."""

from __future__ import annotations

from datetime import datetime, timezone


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def transition_run(run, status: str, *, error_code: str | None = None, error_message: str | None = None) -> None:
    """Apply a run status transition and timestamps."""

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


def start_step(step) -> None:
    timestamp = now_utc()
    step.status = "running"
    step.started_at = timestamp


def finish_step(step, status: str, *, error_code: str | None = None, error_message: str | None = None) -> None:
    step.status = status
    step.completed_at = now_utc()
    if error_code is not None:
        step.error_code = error_code
    if error_message is not None:
        step.error_message = error_message
