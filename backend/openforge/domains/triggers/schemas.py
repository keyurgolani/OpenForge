"""
Trigger schemas for API request/response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from backend.openforge.domains.common.enums import TriggerType
from backend.openforge.domains.triggers.types import (
    TriggerDefinition,
    TriggerStatus,
    TriggerTargetType,
)


class TriggerCreate(BaseModel):
    """Schema for creating a trigger definition."""

    name: str = Field(..., min_length=1, max_length=255)
    trigger_type: TriggerType = Field(...)
    target_type: TriggerTargetType = Field(...)
    target_id: UUID = Field(...)
    schedule_expression: Optional[str] = Field(default=None, max_length=100)
    payload_template: Optional[dict[str, Any]] = Field(default=None)
    is_enabled: bool = Field(default=True)
    status: TriggerStatus = Field(default=TriggerStatus.DRAFT)


class TriggerUpdate(BaseModel):
    """Schema for updating a trigger definition."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    trigger_type: Optional[TriggerType] = Field(default=None)
    target_type: Optional[TriggerTargetType] = Field(default=None)
    target_id: Optional[UUID] = Field(default=None)
    schedule_expression: Optional[str] = Field(default=None, max_length=100)
    payload_template: Optional[dict[str, Any]] = Field(default=None)
    is_enabled: Optional[bool] = Field(default=None)
    status: Optional[TriggerStatus] = Field(default=None)


class TriggerResponse(BaseModel):
    """Schema for trigger response."""

    id: UUID
    name: str
    trigger_type: TriggerType
    target_type: TriggerTargetType
    target_id: UUID
    schedule_expression: Optional[str]
    payload_template: Optional[dict[str, Any]]
    is_enabled: bool
    status: TriggerStatus
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class TriggerListResponse(BaseModel):
    """Schema for trigger list response."""

    triggers: list[TriggerResponse]
    total: int
