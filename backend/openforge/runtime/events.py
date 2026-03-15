"""Runtime event types and helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from openforge.common.time import utc_now


@dataclass(slots=True)
class RuntimeEvent:
    """Structured runtime event payload."""

    run_id: UUID
    event_type: str
    step_id: UUID | None = None
    workflow_id: UUID | None = None
    workflow_version_id: UUID | None = None
    node_id: UUID | None = None
    node_key: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)


RUN_STARTED = "run_started"
STEP_STARTED = "step_started"
STEP_COMPLETED = "step_completed"
STEP_FAILED = "step_failed"
RUN_INTERRUPTED = "run_interrupted"
APPROVAL_REQUESTED = "approval_requested"
RUN_RESUMED = "run_resumed"
CHILD_RUN_SPAWNED = "child_run_spawned"
ARTIFACT_EMITTED = "artifact_emitted"
RUN_COMPLETED = "run_completed"
RUN_FAILED = "run_failed"
RUN_CANCELLED = "run_cancelled"
