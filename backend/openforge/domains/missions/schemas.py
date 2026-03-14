"""
Mission schemas for API request/response models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from openforge.domains.common.enums import ExecutionMode
from openforge.domains.missions.types import MissionStatus


class MissionCreate(BaseModel):
    """Schema for creating a mission definition."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    workflow_id: UUID = Field(...)
    default_profile_ids: list[UUID] = Field(default_factory=list)
    default_trigger_ids: list[UUID] = Field(default_factory=list)
    autonomy_mode: ExecutionMode = Field(default=ExecutionMode.SUPERVISED)
    approval_policy_id: Optional[UUID] = Field(default=None)
    budget_policy_id: Optional[UUID] = Field(default=None)
    output_artifact_types: list[str] = Field(default_factory=list)
    status: MissionStatus = Field(default=MissionStatus.DRAFT)


class MissionUpdate(BaseModel):
    """Schema for updating a mission definition."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    workflow_id: Optional[UUID] = Field(default=None)
    default_profile_ids: Optional[list[UUID]] = Field(default=None)
    default_trigger_ids: Optional[list[UUID]] = Field(default=None)
    autonomy_mode: Optional[ExecutionMode] = Field(default=None)
    approval_policy_id: Optional[UUID] = Field(default=None)
    budget_policy_id: Optional[UUID] = Field(default=None)
    output_artifact_types: Optional[list[str]] = Field(default=None)
    status: Optional[MissionStatus] = Field(default=None)


class MissionResponse(BaseModel):
    """Schema for mission response."""

    id: UUID
    name: str
    slug: str
    description: Optional[str]
    workflow_id: UUID
    default_profile_ids: list[UUID]
    default_trigger_ids: list[UUID]
    autonomy_mode: ExecutionMode
    approval_policy_id: Optional[UUID]
    budget_policy_id: Optional[UUID]
    output_artifact_types: list[str]
    status: MissionStatus
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class MissionListResponse(BaseModel):
    """Schema for mission list response."""

    missions: list[MissionResponse]
    total: int
