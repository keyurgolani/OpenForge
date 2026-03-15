"""
Trigger schemas for API request/response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import TriggerType
from openforge.domains.triggers.types import TriggerStatus, TriggerTargetType


class TriggerCreate(BaseModel):
    """Schema for creating a trigger definition."""

    workspace_id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    trigger_type: TriggerType = Field(...)
    target_type: TriggerTargetType = Field(...)
    target_id: UUID = Field(...)
    schedule_expression: Optional[str] = Field(default=None, max_length=100)
    interval_seconds: Optional[int] = Field(default=None)
    event_type: Optional[str] = Field(default=None, max_length=100)
    payload_template: Optional[dict[str, Any]] = Field(default=None)
    is_enabled: bool = Field(default=True)
    status: TriggerStatus = Field(default=TriggerStatus.DRAFT)


class TriggerUpdate(BaseModel):
    """Schema for updating a trigger definition."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    trigger_type: Optional[TriggerType] = Field(default=None)
    target_type: Optional[TriggerTargetType] = Field(default=None)
    target_id: Optional[UUID] = Field(default=None)
    schedule_expression: Optional[str] = Field(default=None, max_length=100)
    interval_seconds: Optional[int] = Field(default=None)
    event_type: Optional[str] = Field(default=None, max_length=100)
    payload_template: Optional[dict[str, Any]] = Field(default=None)
    is_enabled: Optional[bool] = Field(default=None)
    status: Optional[TriggerStatus] = Field(default=None)


class TriggerResponse(BaseModel):
    """Schema for trigger response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str]
    trigger_type: TriggerType
    target_type: TriggerTargetType
    target_id: UUID
    schedule_expression: Optional[str]
    interval_seconds: Optional[int]
    event_type: Optional[str]
    payload_template: Optional[dict[str, Any]]
    is_enabled: bool
    status: TriggerStatus
    last_fired_at: Optional[datetime]
    next_fire_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]


class TriggerListResponse(BaseModel):
    """Schema for trigger list response."""

    triggers: list[TriggerResponse]
    total: int


class TriggerFireRecord(BaseModel):
    """Schema for a trigger fire history entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    trigger_id: UUID
    mission_id: Optional[UUID]
    run_id: Optional[UUID]
    fired_at: datetime
    launch_status: str
    error_message: Optional[str]
    payload_snapshot: Optional[dict[str, Any]]


class TriggerDiagnosticsResponse(BaseModel):
    """Diagnostics for a trigger: scheduler state, last launch, blocked reasons."""

    trigger_id: UUID
    is_enabled: bool
    status: TriggerStatus
    trigger_type: TriggerType
    next_fire_at: Optional[datetime]
    last_fired_at: Optional[datetime]
    last_launch_status: Optional[str]
    last_launch_error: Optional[str]
    blocked_reasons: list[str]
