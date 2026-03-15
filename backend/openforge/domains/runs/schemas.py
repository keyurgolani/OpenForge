"""Run API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from typing import Any

from openforge.domains.common.enums import ExecutionStatus

from .types import Checkpoint, Run, RunLineage, RunStep, RunType, RuntimeEvent


class RunCreate(BaseModel):
    run_type: RunType = RunType.WORKFLOW
    workflow_id: UUID | None = None
    workflow_version_id: UUID | None = None
    mission_id: UUID | None = None
    parent_run_id: UUID | None = None
    root_run_id: UUID | None = None
    spawned_by_step_id: UUID | None = None
    workspace_id: UUID
    input_payload: dict[str, Any] = Field(default_factory=dict)


class RunUpdate(BaseModel):
    status: ExecutionStatus | None = None
    state_snapshot: dict[str, Any] | None = None
    output_payload: dict[str, Any] | None = None
    current_node_id: UUID | None = None
    error_code: str | None = Field(default=None, max_length=100)
    error_message: str | None = Field(default=None, max_length=5000)


class RunStartRequest(BaseModel):
    workflow_id: UUID
    workflow_version_id: UUID | None = None
    workspace_id: UUID
    input_payload: dict[str, Any] = Field(default_factory=dict)
    parent_run_id: UUID | None = None
    spawned_by_step_id: UUID | None = None


class RunResumeRequest(BaseModel):
    state_patch: dict[str, Any] = Field(default_factory=dict)


class RunResponse(Run):
    model_config = ConfigDict(from_attributes=True)


class RunListResponse(BaseModel):
    runs: list[RunResponse]
    total: int


class RunStepResponse(RunStep):
    model_config = ConfigDict(from_attributes=True)


class RunStepListResponse(BaseModel):
    steps: list[RunStepResponse]
    total: int


class CheckpointResponse(Checkpoint):
    model_config = ConfigDict(from_attributes=True)


class CheckpointListResponse(BaseModel):
    checkpoints: list[CheckpointResponse]
    total: int


class RuntimeEventResponse(RuntimeEvent):
    model_config = ConfigDict(from_attributes=True)


class RuntimeEventListResponse(BaseModel):
    events: list[RuntimeEventResponse]
    total: int


class RunLineageResponse(RunLineage):
    model_config = ConfigDict(from_attributes=True)
