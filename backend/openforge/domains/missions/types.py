"""
Mission domain types.

This module defines the core types and enums for Mission Definitions.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import ExecutionMode, MissionHealthStatus


class MissionStatus(str, Enum):
    """Status of a mission definition."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"
    FAILED = "failed"
    ARCHIVED = "archived"


class MissionDefinition(BaseModel):
    """
    Mission Definition - a packaged autonomous unit.

    A Mission combines a workflow, profile(s), trigger(s), and policies into
    a deployable product unit. This is what users deploy and manage.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(...)
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

    # Health metadata
    last_run_at: Optional[datetime] = Field(default=None)
    last_success_at: Optional[datetime] = Field(default=None)
    last_failure_at: Optional[datetime] = Field(default=None)
    last_triggered_at: Optional[datetime] = Field(default=None)
    health_status: Optional[MissionHealthStatus] = Field(default=MissionHealthStatus.UNKNOWN)
    last_error_summary: Optional[str] = Field(default=None)

    # Audit fields
    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)
