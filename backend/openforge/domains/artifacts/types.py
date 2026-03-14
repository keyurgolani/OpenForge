"""
Artifact domain types.

This module defines the core types and enums for Artifacts.
"""

from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from openforge.domains.common.enums import ArtifactType


class ArtifactStatus(str, Enum):
    """Status of an artifact."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    DELETED = "deleted"


class Artifact(BaseModel):
    """
    Artifact - an output produced by a mission run.

    Artifacts are the persistent outputs created during mission execution.
    They represent the valuable deliverables from AI work.

    Attributes:
        id: Unique identifier
        artifact_type: Type of artifact
        workspace_id: Workspace this artifact belongs to
        source_run_id: Run that produced this artifact
        source_mission_id: Mission that produced this artifact
        title: Display title
        summary: Brief description
        content: The actual artifact content
        metadata: Additional metadata
        status: Current status
        version: Version number
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: User who created this artifact
        updated_by: User who last updated this artifact
    """

    id: UUID = Field(...)
    artifact_type: ArtifactType = Field(...)
    workspace_id: UUID = Field(...)
    source_run_id: Optional[UUID] = Field(default=None)
    source_mission_id: Optional[UUID] = Field(default=None)
    title: str = Field(..., min_length=1, max_length=500)
    summary: Optional[str] = Field(default=None, max_length=2000)
    content: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: ArtifactStatus = Field(default=ArtifactStatus.DRAFT)
    version: int = Field(default=1, ge=1)

    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)

    class Config:
        from_attributes = True
