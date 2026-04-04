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
CHILD_RUN_COMPLETED = "child_run_completed"
HANDOFF_APPLIED = "handoff_applied"
FANOUT_STARTED = "fanout_started"
JOIN_COMPLETED = "join_completed"
MERGE_APPLIED = "merge_applied"
OUTPUT_EMITTED = "output_emitted"
RUN_COMPLETED = "run_completed"
RUN_FAILED = "run_failed"
RUN_CANCELLED = "run_cancelled"
TRIGGER_FIRED = "trigger_fired"
NODE_STARTED = "node_started"
NODE_COMPLETED = "node_completed"
NODE_FAILED = "node_failed"
