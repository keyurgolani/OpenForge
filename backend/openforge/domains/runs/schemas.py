"""
Run schemas for API request/response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from backend.openforge.domains.common.enums import ExecutionStatus
from backend.openforge.domains.runs.types import Run, RunType


class RunCreate(BaseModel):
    """Schema for creating a run."""

    run_type: RunType = Field(...)
    workflow_id: Optional[UUID] = Field(default=None)
    mission_id: Optional[UUID] = Field(default=None)
    parent_run_id: Optional[UUID] = Field(default=None)
    workspace_id: UUID = Field(...)
    input_payload: dict[str, Any] = Field(default_factory=dict)


class RunUpdate(BaseModel):
    """Schema for updating a run."""

    status: Optional[ExecutionStatus] = Field(default=None)
    state_snapshot: Optional[dict[str, Any]] = Field(default=None)
    output_payload: Optional[dict[str, Any]] = Field(default=None)
    error_code: Optional[str] = Field(default=None, max_length=100)
    error_message: Optional[str] = Field(default=None, max_length=5000)


class RunResponse(BaseModel):
    """Schema for run response."""

    id: UUID
    run_type: RunType
    workflow_id: Optional[UUID]
    mission_id: Optional[UUID]
    parent_run_id: Optional[UUID]
    workspace_id: UUID
    status: ExecutionStatus
    state_snapshot: dict[str, Any]
    input_payload: dict[str, Any]
    output_payload: dict[str, Any]
    error_code: Optional[str]
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class RunListResponse(BaseModel):
    """Schema for run list response."""

    runs: list[RunResponse]
    total: int
