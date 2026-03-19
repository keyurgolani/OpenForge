"""Output API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.outputs.types import (
    ArtifactCreationMode,
    ArtifactLink,
    ArtifactLinkType,
    ArtifactObjectType,
    ArtifactSink,
    ArtifactSinkType,
    ArtifactStatus,
    ArtifactSyncStatus,
    ArtifactVersion,
    ArtifactVisibility,
)
from openforge.domains.common.enums import ArtifactType


class OutputLinkCreate(BaseModel):
    """Payload for adding a lineage link."""

    link_type: ArtifactLinkType
    target_type: ArtifactObjectType
    target_id: UUID
    label: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OutputSinkCreate(BaseModel):
    """Payload for adding a sink."""

    sink_type: ArtifactSinkType
    sink_state: str = "configured"
    destination_ref: str | None = None
    sync_status: ArtifactSyncStatus = ArtifactSyncStatus.NOT_PUBLISHED
    metadata: dict[str, Any] = Field(default_factory=dict)


class OutputVersionCreate(BaseModel):
    """Payload for creating a new output version."""

    content_type: str = Field(default="structured_payload", max_length=100)
    body: str | None = None
    structured_payload: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = Field(default=None, max_length=2000)
    change_note: str | None = Field(default=None, max_length=2000)
    source_run_id: UUID | None = None
    source_evidence_packet_id: UUID | None = None
    status: ArtifactStatus = ArtifactStatus.DRAFT
    created_by_type: str | None = Field(default=None, max_length=50)
    created_by_id: UUID | None = None


class OutputCreate(BaseModel):
    """Schema for creating an output."""

    artifact_type: ArtifactType
    workspace_id: UUID
    title: str = Field(..., min_length=1, max_length=500)
    summary: str | None = Field(default=None, max_length=2000)
    status: ArtifactStatus = ArtifactStatus.DRAFT
    visibility: ArtifactVisibility = ArtifactVisibility.WORKSPACE
    creation_mode: ArtifactCreationMode = ArtifactCreationMode.USER_CREATED
    source_run_id: UUID | None = None
    source_workflow_id: UUID | None = None
    source_mission_id: UUID | None = None
    source_profile_id: UUID | None = None
    created_by_type: str | None = Field(default=None, max_length=50)
    created_by_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Compatibility with the older shape.
    content: dict[str, Any] = Field(default_factory=dict)

    # Version payload fields.
    content_type: str = Field(default="structured_payload", max_length=100)
    body: str | None = None
    structured_payload: dict[str, Any] = Field(default_factory=dict)
    change_note: str | None = Field(default=None, max_length=2000)
    source_evidence_packet_id: UUID | None = None

    links: list[OutputLinkCreate] = Field(default_factory=list)
    sinks: list[OutputSinkCreate] = Field(default_factory=list)


class OutputUpdate(BaseModel):
    """Schema for updating an output or appending a new version."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    summary: str | None = Field(default=None, max_length=2000)
    metadata: dict[str, Any] | None = None
    status: ArtifactStatus | None = None
    visibility: ArtifactVisibility | None = None
    tags: list[str] | None = None

    # Compatibility field from the earlier API.
    content: dict[str, Any] | None = None

    content_type: str | None = Field(default=None, max_length=100)
    body: str | None = None
    structured_payload: dict[str, Any] | None = None
    change_note: str | None = Field(default=None, max_length=2000)
    source_evidence_packet_id: UUID | None = None
    source_run_id: UUID | None = None
    promote_version_id: UUID | None = None


class OutputVersionResponse(ArtifactVersion):
    """Output version response."""


class OutputLinkResponse(ArtifactLink):
    """Output link response."""


class OutputSinkResponse(ArtifactSink):
    """Output sink response."""


class OutputResponse(BaseModel):
    """Output response with full detail fields."""

    id: UUID
    artifact_type: ArtifactType
    workspace_id: UUID
    title: str
    summary: str | None = None
    status: ArtifactStatus = ArtifactStatus.DRAFT
    visibility: ArtifactVisibility = ArtifactVisibility.WORKSPACE
    creation_mode: ArtifactCreationMode = ArtifactCreationMode.USER_CREATED
    current_version_id: UUID | None = None
    current_version_number: int = 1
    source_run_id: UUID | None = None
    source_workflow_id: UUID | None = None
    source_mission_id: UUID | None = None
    source_profile_id: UUID | None = None
    created_by_type: str | None = None
    created_by_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    current_version: OutputVersionResponse | None = None

    # Compatibility fields for existing callers/UI.
    content: dict[str, Any] = Field(default_factory=dict)
    version: int = 1

    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class OutputLineageResponse(BaseModel):
    """Grouped lineage response for UI consumption."""

    artifact_id: UUID
    sources: list[OutputLinkResponse] = Field(default_factory=list)
    derivations: list[OutputLinkResponse] = Field(default_factory=list)
    related: list[OutputLinkResponse] = Field(default_factory=list)


class OutputListResponse(BaseModel):
    """Schema for output list response."""

    outputs: list[OutputResponse]
    total: int


class OutputVersionListResponse(BaseModel):
    """List response for output versions."""

    versions: list[OutputVersionResponse]
    total: int


class OutputSinkListResponse(BaseModel):
    """List response for output sinks."""

    sinks: list[OutputSinkResponse]
    total: int


class OutputDiffResponse(BaseModel):
    """Summary of differences between two output versions."""

    artifact_id: UUID
    from_version_id: UUID
    to_version_id: UUID
    from_version_number: int
    to_version_number: int
    content_changed: bool
    structured_payload_changed: bool
    summary_changed: bool
    change_note_changed: bool
    content_preview: str

    model_config = ConfigDict(from_attributes=True)


# Backward-compat aliases
ArtifactCreate = OutputCreate
ArtifactUpdate = OutputUpdate
ArtifactResponse = OutputResponse
ArtifactListResponse = OutputListResponse
ArtifactVersionCreate = OutputVersionCreate
ArtifactVersionListResponse = OutputVersionListResponse
ArtifactVersionResponse = OutputVersionResponse
ArtifactLineageResponse = OutputLineageResponse
ArtifactSinkListResponse = OutputSinkListResponse
ArtifactDiffResponse = OutputDiffResponse
ArtifactLinkCreate = OutputLinkCreate
ArtifactLinkResponse = OutputLinkResponse
ArtifactSinkCreate = OutputSinkCreate
ArtifactSinkResponse = OutputSinkResponse
