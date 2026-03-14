"""
Mission domain types.

This module defines the core types and enums for Mission Definitions.
"""

from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from backend.openforge.domains.common.enums import ExecutionMode


class MissionStatus(str, Enum):
    """Status of a mission definition."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class MissionDefinition(BaseModel):
    """
    Mission Definition - a packaged autonomous unit.

    A Mission combines a workflow, profile(s), trigger(s), and policies into
    a deployable product unit. This is what users deploy and manage.

    Attributes:
        id: Unique identifier
        name: Display name
        slug: URL-friendly identifier
        description: Human-readable description
        workflow_id: Reference to the workflow definition
        default_profile_ids: List of profile references
        default_trigger_ids: List of trigger references
        autonomy_mode: Execution autonomy level
        approval_policy_id: Reference to approval policy
        budget_policy_id: Reference to budget policy
        output_artifact_types: Types of artifacts this mission produces
        status: Current status
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: User who created this mission
        updated_by: User who last updated this mission
    """

    id: UUID = Field(...)
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

    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)

    class Config:
        from_attributes = True
