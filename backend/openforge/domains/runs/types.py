"""Run domain types."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import ExecutionStatus


class RunType(str, Enum):
    """Types of runs."""

    WORKFLOW = "workflow"
    MISSION = "mission"
    STEP = "step"
    SUBWORKFLOW = "subworkflow"
    AUTOMATION = "automation"
    STRATEGY = "strategy"
    SINK = "sink"


class RunStep(BaseModel):
    """Durable run step."""

    id: UUID
    run_id: UUID
    node_id: UUID | None = None
    node_key: str | None = None
    step_index: int = Field(ge=1)
    status: ExecutionStatus
    input_snapshot: dict[str, Any] = Field(default_factory=dict)
    output_snapshot: dict[str, Any] = Field(default_factory=dict)
    delegation_mode: str | None = None
    merge_strategy: str | None = None
    join_group_id: str | None = None
    branch_key: str | None = None
    branch_index: int | None = None
    handoff_reason: str | None = None
    composite_metadata: dict[str, Any] = Field(default_factory=dict)
    checkpoint_id: UUID | None = None
    error_code: str | None = None
    error_message: str | None = None
    retry_count: int = Field(default=0, ge=0)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class Checkpoint(BaseModel):
    """Persisted run checkpoint."""

    id: UUID
    run_id: UUID
    step_id: UUID | None = None
    checkpoint_type: str
    state_snapshot: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RuntimeEvent(BaseModel):
    """Persisted runtime event."""

    id: UUID
    run_id: UUID
    step_id: UUID | None = None
    node_id: UUID | None = None
    node_key: str | None = None
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class Run(BaseModel):
    """Durable workflow or mission run."""

    id: UUID
    run_type: RunType
    deployment_id: UUID | None = None
    parent_run_id: UUID | None = None
    root_run_id: UUID | None = None
    spawned_by_step_id: UUID | None = None
    workspace_id: UUID
    status: ExecutionStatus = ExecutionStatus.PENDING
    state_snapshot: dict[str, Any] = Field(default_factory=dict)
    input_payload: dict[str, Any] = Field(default_factory=dict)
    output_payload: dict[str, Any] = Field(default_factory=dict)
    current_node_id: UUID | None = None
    delegation_mode: str | None = None
    merge_strategy: str | None = None
    join_group_id: str | None = None
    branch_key: str | None = None
    branch_index: int | None = None
    handoff_reason: str | None = None
    composite_metadata: dict[str, Any] = Field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RunLineage(BaseModel):
    """Parent/child run lineage."""

    run_id: UUID
    parent_run: Run | None = None
    child_runs: list[Run] = Field(default_factory=list)
    tree: dict[str, Any] = Field(default_factory=dict)
    delegation_history: list[dict[str, Any]] = Field(default_factory=list)
    branch_groups: list[dict[str, Any]] = Field(default_factory=list)
