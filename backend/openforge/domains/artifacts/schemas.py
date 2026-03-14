"""
Artifact schemas for API request/response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from backend.openforge.domains.artifacts.types import Artifact, ArtifactStatus
from backend.openforge.domains.common.enums import ArtifactType


class ArtifactCreate(BaseModel):
    """Schema for creating an artifact."""

    artifact_type: ArtifactType = Field(...)
    workspace_id: UUID = Field(...)
    source_run_id: Optional[UUID] = Field(default=None)
    source_mission_id: Optional[UUID] = Field(default=None)
    title: str = Field(..., min_length=1, max_length=500)
    summary: Optional[str] = Field(default=None, max_length=2000)
    content: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: ArtifactStatus = Field(default=ArtifactStatus.DRAFT)


class ArtifactUpdate(BaseModel):
    """Schema for updating an artifact."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    summary: Optional[str] = Field(default=None, max_length=2000)
    content: Optional[dict[str, Any]] = Field(default=None)
    metadata: Optional[dict[str, Any]] = Field(default=None)
    status: Optional[ArtifactStatus] = Field(default=None)
    version: Optional[int] = Field(default=None, ge=1)


class ArtifactResponse(BaseModel):
    """Schema for artifact response."""

    id: UUID
    artifact_type: ArtifactType
    workspace_id: UUID
    source_run_id: Optional[UUID]
    source_mission_id: Optional[UUID]
    title: str
    summary: Optional[str]
    content: dict[str, Any]
    metadata: dict[str, Any]
    status: ArtifactStatus
    version: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class ArtifactListResponse(BaseModel):
    """Schema for artifact list response."""

    artifacts: list[ArtifactResponse]
    total: int
