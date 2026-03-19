"""Output domain types."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import ArtifactType


class ArtifactStatus(str, Enum):
    """Lifecycle status of an output or output version."""

    DRAFT = "draft"
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    ARCHIVED = "archived"
    FAILED = "failed"
    DELETED = "deleted"


class ArtifactVisibility(str, Enum):
    """Visibility for output browsing and publishing workflows."""

    PRIVATE = "private"
    WORKSPACE = "workspace"
    EXPORT_READY = "export_ready"
    HIDDEN = "hidden"


class ArtifactCreationMode(str, Enum):
    """How an output entered the system."""

    USER_CREATED = "user_created"
    RUN_GENERATED = "run_generated"
    MISSION_GENERATED = "mission_generated"
    IMPORTED = "imported"
    DERIVED = "derived"


class ArtifactObjectType(str, Enum):
    """Objects that can participate in output lineage."""

    RUN = "run"
    WORKFLOW = "workflow"
    MISSION = "mission"
    PROFILE = "profile"
    EVIDENCE_PACKET = "evidence_packet"
    KNOWLEDGE = "knowledge"
    ENTITY = "entity"
    RELATIONSHIP = "relationship"
    ARTIFACT = "artifact"


class ArtifactLinkType(str, Enum):
    """Semantic meaning of a lineage link."""

    SOURCE = "source"
    INFORMED_BY = "informed_by"
    DERIVED_FROM = "derived_from"
    RELATED = "related"


class ArtifactSinkType(str, Enum):
    """Destination classes for output publication/sync."""

    INTERNAL_WORKSPACE = "internal_workspace"
    KNOWLEDGE_LINKED = "knowledge_linked"
    FILE_EXPORT = "file_export"
    EXTERNAL_PLACEHOLDER = "external_placeholder"


class ArtifactSyncStatus(str, Enum):
    """State of a sink/export sync."""

    NOT_PUBLISHED = "not_published"
    PENDING_SYNC = "pending_sync"
    SYNCED = "synced"
    FAILED_SYNC = "failed_sync"


class ArtifactVersion(BaseModel):
    """Version snapshot for an output."""

    id: UUID
    artifact_id: UUID
    version_number: int = Field(ge=1)
    content_type: str = Field(default="structured_payload")
    content: str | None = None
    structured_payload: dict[str, Any] = Field(default_factory=dict)
    summary: str | None = None
    change_note: str | None = None
    source_run_id: UUID | None = None
    source_evidence_packet_id: UUID | None = None
    status: ArtifactStatus = ArtifactStatus.DRAFT
    created_by_type: str | None = None
    created_by_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ArtifactLink(BaseModel):
    """Lineage link for an output."""

    id: UUID
    artifact_id: UUID
    version_id: UUID | None = None
    link_type: ArtifactLinkType
    target_type: ArtifactObjectType
    target_id: UUID
    label: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ArtifactSink(BaseModel):
    """Destination or export state for an output."""

    id: UUID
    artifact_id: UUID
    sink_type: ArtifactSinkType
    sink_state: str = "configured"
    destination_ref: str | None = None
    sync_status: ArtifactSyncStatus = ArtifactSyncStatus.NOT_PUBLISHED
    metadata: dict[str, Any] = Field(default_factory=dict)
    last_synced_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class Artifact(BaseModel):
    """Output detail model."""

    id: UUID
    artifact_type: ArtifactType
    workspace_id: UUID
    title: str
    summary: str | None = None
    status: ArtifactStatus = ArtifactStatus.DRAFT
    visibility: ArtifactVisibility = ArtifactVisibility.WORKSPACE
    creation_mode: ArtifactCreationMode = ArtifactCreationMode.USER_CREATED
    current_version_id: UUID | None = None
    current_version_number: int = Field(default=1, ge=1)
    source_run_id: UUID | None = None
    source_workflow_id: UUID | None = None
    source_mission_id: UUID | None = None
    source_profile_id: UUID | None = None
    created_by_type: str | None = None
    created_by_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    current_version: ArtifactVersion | None = None
    content: dict[str, Any] = Field(default_factory=dict)
    version: int = Field(default=1, ge=1)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


ARTIFACT_TYPE_DISPLAY: dict[str, dict[str, Any]] = {
    ArtifactType.NOTE.value: {"label": "Note", "icon": "notebook", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.SUMMARY.value: {"label": "Summary", "icon": "scan-text", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.REPORT.value: {"label": "Report", "icon": "file-text", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.PLAN.value: {"label": "Plan", "icon": "list-checks", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.TARGET.value: {"label": "Target", "icon": "target", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.EVIDENCE_PACKET_REF.value: {"label": "Evidence Packet", "icon": "folder-search", "default_visibility": ArtifactVisibility.PRIVATE.value},
    ArtifactType.RESEARCH_BRIEF.value: {"label": "Research Brief", "icon": "microscope", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.DATASET.value: {"label": "Dataset", "icon": "database", "default_visibility": ArtifactVisibility.PRIVATE.value},
    ArtifactType.ALERT.value: {"label": "Alert", "icon": "triangle-alert", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.EXPERIMENT_RESULT.value: {"label": "Experiment Result", "icon": "flask-conical", "default_visibility": ArtifactVisibility.WORKSPACE.value},
    ArtifactType.NOTIFICATION_DRAFT.value: {"label": "Notification Draft", "icon": "bell", "default_visibility": ArtifactVisibility.PRIVATE.value},
    ArtifactType.GENERIC_DOCUMENT.value: {"label": "Document", "icon": "file", "default_visibility": ArtifactVisibility.WORKSPACE.value},
}
