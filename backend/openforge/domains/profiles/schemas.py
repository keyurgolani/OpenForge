"""
Profile schemas for API request and response models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from .types import AgentProfile, ProfileRole, ProfileStatus


class ProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
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


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
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


class ProfileResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
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
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class ProfileListResponse(BaseModel):
    profiles: list[ProfileResponse]
    total: int
