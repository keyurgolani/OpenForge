"""
Mission schemas for API request/response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import ExecutionMode, MissionHealthStatus
from openforge.domains.missions.types import MissionStatus


class MissionCreate(BaseModel):
    """Schema for creating a mission definition."""

    workspace_id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    workflow_id: UUID = Field(...)
    workflow_version_id: Optional[UUID] = Field(default=None)
    default_profile_ids: list[UUID] = Field(default_factory=list)
    default_trigger_ids: list[UUID] = Field(default_factory=list)
    autonomy_mode: ExecutionMode = Field(default=ExecutionMode.SUPERVISED)
    approval_policy_id: Optional[UUID] = Field(default=None)
    budget_policy_id: Optional[UUID] = Field(default=None)
    output_artifact_types: list[str] = Field(default_factory=list)
    is_system: bool = Field(default=False)
    is_template: bool = Field(default=False)
    recommended_use_case: Optional[str] = Field(default=None)
    status: MissionStatus = Field(default=MissionStatus.DRAFT)
    # Phase 12 catalog metadata
    tags: list[str] = Field(default_factory=list)
    catalog_metadata: dict[str, Any] = Field(default_factory=dict)
    is_featured: bool = Field(default=False)
    is_recommended: bool = Field(default=False)
    sort_priority: int = Field(default=0)
    icon: Optional[str] = Field(default=None, max_length=100)


class MissionUpdate(BaseModel):
    """Schema for updating a mission definition."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    workflow_id: Optional[UUID] = Field(default=None)
    workflow_version_id: Optional[UUID] = Field(default=None)
    default_profile_ids: Optional[list[UUID]] = Field(default=None)
    default_trigger_ids: Optional[list[UUID]] = Field(default=None)
    autonomy_mode: Optional[ExecutionMode] = Field(default=None)
    approval_policy_id: Optional[UUID] = Field(default=None)
    budget_policy_id: Optional[UUID] = Field(default=None)
    output_artifact_types: Optional[list[str]] = Field(default=None)
    is_system: Optional[bool] = Field(default=None)
    is_template: Optional[bool] = Field(default=None)
    recommended_use_case: Optional[str] = Field(default=None)
    status: Optional[MissionStatus] = Field(default=None)
    tags: Optional[list[str]] = Field(default=None)
    catalog_metadata: Optional[dict[str, Any]] = Field(default=None)
    is_featured: Optional[bool] = Field(default=None)
    is_recommended: Optional[bool] = Field(default=None)
    sort_priority: Optional[int] = Field(default=None)
    icon: Optional[str] = Field(default=None, max_length=100)


class MissionResponse(BaseModel):
    """Schema for mission response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: Optional[UUID]
    name: str
    slug: str
    description: Optional[str]
    workflow_id: UUID
    workflow_version_id: Optional[UUID]
    default_profile_ids: list[UUID]
    default_trigger_ids: list[UUID]
    autonomy_mode: ExecutionMode
    approval_policy_id: Optional[UUID]
    budget_policy_id: Optional[UUID]
    output_artifact_types: list[str]
    is_system: bool
    is_template: bool
    recommended_use_case: Optional[str]
    status: MissionStatus
    # Phase 12 catalog metadata
    tags: list[str] = Field(default_factory=list)
    catalog_metadata: dict[str, Any] = Field(default_factory=dict)
    is_featured: bool = False
    is_recommended: bool = False
    sort_priority: int = 0
    icon: Optional[str] = None

    # Health metadata
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]
    last_failure_at: Optional[datetime]
    last_triggered_at: Optional[datetime]
    health_status: Optional[str]
    last_error_summary: Optional[str]

    # Audit fields
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]


class MissionListResponse(BaseModel):
    """Schema for mission list response."""

    missions: list[MissionResponse]
    total: int


class MissionTemplateCloneRequest(BaseModel):
    """Request body for cloning a mission template."""
    workspace_id: UUID
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)


class MissionHealthResponse(BaseModel):
    """Schema for mission health status response."""

    mission_id: UUID
    health_status: MissionHealthStatus
    summary: str
    recent_run_count: int = 0
    recent_success_count: int = 0
    recent_failure_count: int = 0
    success_rate: Optional[float] = None
    last_run_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    last_error_summary: Optional[str] = None


class MissionDiagnosticsResponse(BaseModel):
    """Schema for mission diagnostics including budget, trigger, and error info."""

    mission_id: UUID
    # Budget usage
    budget_policy_id: Optional[UUID] = None
    runs_today: int = 0
    max_runs_per_day: Optional[int] = None
    concurrent_runs: int = 0
    max_concurrent_runs: Optional[int] = None
    budget_exhausted: bool = False
    cooldown_active: bool = False
    cooldown_remaining_seconds: Optional[int] = None

    # Trigger summary
    trigger_count: int = 0
    enabled_trigger_count: int = 0
    last_triggered_at: Optional[datetime] = None

    # Error summary
    recent_error_count: int = 0
    last_error_summary: Optional[str] = None
    repeated_errors: list[str] = Field(default_factory=list)


class MissionLaunchRequest(BaseModel):
    """Schema for launching a mission manually."""

    parameters: Optional[dict[str, Any]] = Field(default=None)


class MissionLaunchResponse(BaseModel):
    """Schema for mission launch result."""

    run_id: UUID
    status: str
    message: str
