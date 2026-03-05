from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import TaskLog

MAX_TASK_ERROR_LENGTH = 500


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def start_task_log(
    db: AsyncSession,
    *,
    task_type: str,
    workspace_id: Optional[UUID] = None,
) -> TaskLog:
    """Create a running task log row in the current DB session."""
    log = TaskLog(
        task_type=task_type,
        status="running",
        workspace_id=workspace_id,
        started_at=_utc_now(),
    )
    db.add(log)
    await db.flush()
    return log


def mark_task_log_done(log: TaskLog, *, item_count: Optional[int] = None) -> None:
    finished_at = _utc_now()
    started_at = log.started_at or finished_at
    log.status = "done"
    log.finished_at = finished_at
    log.duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
    log.error_message = None
    if item_count is not None:
        log.item_count = item_count


def mark_task_log_failed(log: TaskLog, error: Exception | str | None) -> None:
    finished_at = _utc_now()
    started_at = log.started_at or finished_at
    message = str(error or "Unknown error")
    log.status = "failed"
    log.finished_at = finished_at
    log.duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
    log.error_message = message[:MAX_TASK_ERROR_LENGTH]
