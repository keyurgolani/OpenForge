"""Deployment domain API schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DeploymentCreate(BaseModel):
    workspace_id: UUID
    input_values: dict[str, Any] = Field(default_factory=dict)
    schedule_expression: Optional[str] = Field(
        default=None,
        description="Cron expression to override the automation's default schedule. "
        "Set to empty string for manual-only (no schedule).",
    )
    interval_seconds: Optional[int] = Field(
        default=None,
        description="Interval in seconds for recurring execution. "
        "Mutually exclusive with schedule_expression.",
    )


class DeploymentResponse(BaseModel):
    id: UUID
    automation_id: UUID
    automation_name: Optional[str] = None
    workspace_id: UUID
    agent_spec_id: Optional[UUID] = None
    deployed_by: Optional[str] = None
    input_values: dict[str, Any] = Field(default_factory=dict)
    status: str
    trigger_id: Optional[UUID] = None
    trigger_type: Optional[str] = None
    schedule_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    last_run_id: Optional[UUID] = None
    last_run_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    torn_down_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DeploymentListResponse(BaseModel):
    deployments: list[DeploymentResponse]
    total: int
