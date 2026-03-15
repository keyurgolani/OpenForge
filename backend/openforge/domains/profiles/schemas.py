"""
Profile schemas for API request and response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .types import AgentProfile, ProfileRole, ProfileStatus


class ProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    version: str = Field(default="1.0.0", min_length=1, max_length=20)
    role: ProfileRole = Field(default=ProfileRole.ASSISTANT)
    system_prompt_ref: Optional[str] = Field(default=None, max_length=500)
    model_policy_id: Optional[UUID] = None
    memory_policy_id: Optional[UUID] = None
    safety_policy_id: Optional[UUID] = None
    capability_bundle_ids: list[UUID] = Field(default_factory=list)
    output_contract_id: Optional[UUID] = None
    is_system: bool = False
    is_template: bool = False
    status: ProfileStatus = Field(default=ProfileStatus.DRAFT)
    icon: Optional[str] = Field(default=None, max_length=100)
    tags: list[str] = Field(default_factory=list)
    catalog_metadata: dict[str, Any] = Field(default_factory=dict)
    is_featured: bool = False
    is_recommended: bool = False
    sort_priority: int = 0


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    version: Optional[str] = Field(default=None, min_length=1, max_length=20)
    role: Optional[ProfileRole] = None
    system_prompt_ref: Optional[str] = Field(default=None, max_length=500)
    model_policy_id: Optional[UUID] = None
    memory_policy_id: Optional[UUID] = None
    safety_policy_id: Optional[UUID] = None
    capability_bundle_ids: Optional[list[UUID]] = None
    output_contract_id: Optional[UUID] = None
    is_system: Optional[bool] = None
    is_template: Optional[bool] = None
    status: Optional[ProfileStatus] = None
    icon: Optional[str] = Field(default=None, max_length=100)
    tags: Optional[list[str]] = None
    catalog_metadata: Optional[dict[str, Any]] = None
    is_featured: Optional[bool] = None
    is_recommended: Optional[bool] = None
    sort_priority: Optional[int] = None


class ProfileResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    version: str
    role: ProfileRole
    system_prompt_ref: Optional[str]
    model_policy_id: Optional[UUID]
    memory_policy_id: Optional[UUID]
    safety_policy_id: Optional[UUID]
    capability_bundle_ids: list[UUID]
    output_contract_id: Optional[UUID]
    is_system: bool
    is_template: bool
    status: ProfileStatus
    icon: Optional[str]
    tags: list[str] = Field(default_factory=list)
    catalog_metadata: dict[str, Any] = Field(default_factory=dict)
    is_featured: bool = False
    is_recommended: bool = False
    sort_priority: int = 0
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    model_config = ConfigDict(from_attributes=True)


class ProfileListResponse(BaseModel):
    profiles: list[ProfileResponse]
    total: int


class ProfileTemplateCloneRequest(BaseModel):
    """Request body for cloning a profile template."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)


class ResolvedProfileResponse(BaseModel):
    profile: ProfileResponse
    capability_bundles: list[dict[str, Any]] = Field(default_factory=list)
    model_policy: Optional[dict[str, Any]] = None
    memory_policy: Optional[dict[str, Any]] = None
    safety_policy: Optional[dict[str, Any]] = None
    output_contract: Optional[dict[str, Any]] = None
    effective_tools_enabled: bool = False
    effective_allowed_tool_categories: Optional[list[str]] = None
    effective_blocked_tool_ids: list[str] = Field(default_factory=list)
    effective_tool_overrides: dict[str, str] = Field(default_factory=dict)
    effective_skill_ids: list[str] = Field(default_factory=list)
    effective_retrieval_enabled: bool = False
    effective_retrieval_limit: int = 0
    effective_retrieval_score_threshold: float = 0.35
    effective_knowledge_scope: str = "workspace"
    effective_history_limit: int = 20
    effective_attachment_support: bool = True
    effective_auto_bookmark_urls: bool = True
    effective_mention_support: bool = True
    effective_default_model: Optional[str] = None
    effective_allow_runtime_override: bool = True
    effective_execution_mode: str = "streaming"


class ProfileValidationResponse(BaseModel):
    profile_id: UUID
    is_complete: bool
    missing_fields: list[str] = Field(default_factory=list)
    invalid_references: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ProfileComparisonSide(ProfileResponse):
    pass


class ProfileFieldDifference(BaseModel):
    left: Any = None
    right: Any = None


class ProfileComparisonResponse(BaseModel):
    left: ProfileComparisonSide
    right: ProfileComparisonSide
    differences: dict[str, ProfileFieldDifference] = Field(default_factory=dict)
