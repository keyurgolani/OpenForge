"""Profile domain types."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProfileRole(str, Enum):
    """Roles that a profile can play."""

    ASSISTANT = "assistant"  # General purpose assistant
    SPECIALIST = "specialist"  # Domain-specific expert
    WORKER = "worker"  # Background task worker
    COORDINATOR = "coordinator"  # Orchestrates other profiles
    REVIEWER = "reviewer"  # Reviews and validates outputs


class ProfileStatus(str, Enum):
    """Status of a profile."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class AgentProfile(BaseModel):
    """
    Agent Profile - a worker abstraction defining capabilities.
    """

    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    version: str = Field(default="1.0.0", min_length=1, max_length=20)
    role: ProfileRole = Field(default=ProfileRole.ASSISTANT)
    system_prompt_ref: Optional[str] = Field(default=None, max_length=500)
    model_policy_id: Optional[UUID] = Field(default=None)
    memory_policy_id: Optional[UUID] = Field(default=None)
    safety_policy_id: Optional[UUID] = Field(default=None)
    capability_bundle_ids: list[UUID] = Field(default_factory=list)
    output_contract_id: Optional[UUID] = Field(default=None)
    is_system: bool = Field(default=False)
    is_template: bool = Field(default=False)
    status: ProfileStatus = Field(default=ProfileStatus.DRAFT)
    icon: Optional[str] = Field(default=None, max_length=100)
    # Phase 12 catalog metadata
    tags: list[str] = Field(default_factory=list)
    catalog_metadata: dict[str, Any] = Field(default_factory=dict)
    is_featured: bool = Field(default=False)
    is_recommended: bool = Field(default=False)
    sort_priority: int = Field(default=0)

    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)

    model_config = ConfigDict(from_attributes=True)
