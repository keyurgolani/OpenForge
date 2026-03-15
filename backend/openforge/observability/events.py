"""Structured telemetry event envelope and helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from openforge.common.time import utc_now


@dataclass(slots=True)
class TelemetryEvent:
    """Structured telemetry event with full correlation context."""
    event_type: str
    run_id: UUID | None = None
    step_id: UUID | None = None
    workflow_id: UUID | None = None
    workflow_version_id: UUID | None = None
    mission_id: UUID | None = None
    trigger_id: UUID | None = None
    node_id: UUID | None = None
    node_key: str | None = None
    artifact_id: UUID | None = None
    approval_id: UUID | None = None
    trace_id: str | None = None
    span_id: str | None = None
    parent_run_id: UUID | None = None
    root_run_id: UUID | None = None
    status: str | None = None
    outcome: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"event_type": self.event_type, "created_at": self.created_at.isoformat()}
        for fld in (
            "run_id", "step_id", "workflow_id", "workflow_version_id", "mission_id",
            "trigger_id", "node_id", "artifact_id", "approval_id",
            "trace_id", "span_id", "parent_run_id", "root_run_id",
        ):
            val = getattr(self, fld)
            if val is not None:
                result[fld] = str(val) if isinstance(val, UUID) else val
        if self.node_key:
            result["node_key"] = self.node_key
        if self.status:
            result["status"] = self.status
        if self.outcome:
            result["outcome"] = self.outcome
        if self.payload:
            result["payload"] = self.payload
        return result


# --- Telemetry event type constants ---
# These extend the existing runtime event types with observability-specific events

USAGE_RECORDED = "usage_recorded"
FAILURE_RECORDED = "failure_recorded"
COST_THRESHOLD_WARNING = "cost_threshold_warning"
APPROVAL_OUTCOME_RECORDED = "approval_outcome_recorded"
MISSION_HEALTH_CHANGED = "mission_health_changed"
EVALUATION_STARTED = "evaluation_started"
EVALUATION_COMPLETED = "evaluation_completed"
EVALUATION_SCENARIO_PASSED = "evaluation_scenario_passed"
EVALUATION_SCENARIO_FAILED = "evaluation_scenario_failed"
REGRESSION_DETECTED = "regression_detected"
BASELINE_UPDATED = "baseline_updated"
