from datetime import datetime, timedelta, timezone

from openforge.db.models import TaskLog
from openforge.utils.task_audit import (
    MAX_TASK_ERROR_LENGTH,
    mark_task_log_done,
    mark_task_log_failed,
)


def test_mark_task_log_done_sets_status_and_duration() -> None:
    started_at = datetime.now(timezone.utc) - timedelta(seconds=2)
    log = TaskLog(task_type="summarize_note", status="running", started_at=started_at)

    mark_task_log_done(log, item_count=1)

    assert log.status == "done"
    assert log.item_count == 1
    assert log.error_message is None
    assert log.finished_at is not None
    assert log.duration_ms is not None and log.duration_ms >= 2000


def test_mark_task_log_failed_truncates_error_message() -> None:
    started_at = datetime.now(timezone.utc) - timedelta(milliseconds=500)
    log = TaskLog(task_type="extract_note_insights", status="running", started_at=started_at)
    long_message = "x" * (MAX_TASK_ERROR_LENGTH + 25)

    mark_task_log_failed(log, RuntimeError(long_message))

    assert log.status == "failed"
    assert log.finished_at is not None
    assert log.duration_ms is not None and log.duration_ms >= 500
    assert log.error_message is not None
    assert len(log.error_message) == MAX_TASK_ERROR_LENGTH
