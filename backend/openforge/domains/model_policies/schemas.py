"""Model Policy schemas for API request and response models."""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from .types import ModelPolicy


class ModelPolicyCreate(BaseModel):
    """Schema for creating a new model policy."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    default_provider_id: Optional[UUID] = Field(default=None)
    default_model: Optional[str] = Field(default=None, max_length=200)
    allow_runtime_override: bool = Field(default=True)
    allowed_models: list[str] = Field(default_factory=list)
    blocked_models: list[str] = Field(default_factory=list)
    max_tokens_per_request: Optional[int] = Field(default=None, ge=1)
    max_tokens_per_day: Optional[int] = Field(default=None, ge=1)


class ModelPolicyUpdate(BaseModel):
    """Schema for updating an existing model policy."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    default_provider_id: Optional[UUID] = None
    default_model: Optional[str] = Field(default=None, max_length=200)
    allow_runtime_override: Optional[bool] = None
    allowed_models: Optional[list[str]] = None
    blocked_models: Optional[list[str]] = None
    max_tokens_per_request: Optional[int] = Field(default=None, ge=1)
    max_tokens_per_day: Optional[int] = Field(default=None, ge=1)
    is_system: Optional[bool] = None
    status: Optional[str] = None


class ModelPolicyResponse(BaseModel):
    """Schema for model policy API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: Optional[str]
    default_provider_id: Optional[UUID]
    default_model: Optional[str]
    allow_runtime_override: bool
    allowed_models: list[str]
    blocked_models: list[str]
    max_tokens_per_request: Optional[int]
    max_tokens_per_day: Optional[int]
    is_system: bool
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]


class ModelPolicyListResponse(BaseModel):
    """Schema for list of model policies."""
    policies: list[ModelPolicyResponse]
    total: int
