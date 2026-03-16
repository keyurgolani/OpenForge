"""Capability Bundle schemas for API request and response models."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .types import KnowledgeScope


class CapabilityBundleCreate(BaseModel):
    """Schema for creating a new capability bundle."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    # Tool capabilities
    tools_enabled: bool = Field(default=True)
    allowed_tool_categories: Optional[list[str]] = Field(default=None)
    blocked_tool_ids: list[str] = Field(default_factory=list)
    tool_overrides: dict[str, str] = Field(default_factory=dict)
    max_tool_calls_per_minute: int = Field(default=30, ge=1)
    max_tool_calls_per_execution: int = Field(default=200, ge=1)
    # Skill capabilities
    skill_ids: list[str] = Field(default_factory=list)
    # Retrieval capabilities
    retrieval_enabled: bool = Field(default=True)
    retrieval_limit: int = Field(default=5, ge=1, le=100)
    retrieval_score_threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    knowledge_scope: KnowledgeScope = Field(default=KnowledgeScope.WORKSPACE)


class CapabilityBundleUpdate(BaseModel):
    """Schema for updating an existing capability bundle."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    tools_enabled: Optional[bool] = None
    allowed_tool_categories: Optional[list[str]] = None
    blocked_tool_ids: Optional[list[str]] = None
    tool_overrides: Optional[dict[str, str]] = None
    max_tool_calls_per_minute: Optional[int] = Field(default=None, ge=1, le=1000)
    max_tool_calls_per_execution: Optional[int] = Field(default=None, ge=1, le=1000)
    skill_ids: Optional[list[str]] = None
    retrieval_enabled: Optional[bool] = None
    retrieval_limit: Optional[int] = Field(default=None, ge=1, le=100)
    retrieval_score_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    knowledge_scope: Optional[KnowledgeScope] = None
    is_system: Optional[bool] = None
    status: Optional[str] = None


class CapabilityBundleResponse(BaseModel):
    """Schema for capability bundle API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: Optional[str]
    tools_enabled: bool
    allowed_tool_categories: Optional[list[str]]
    blocked_tool_ids: list[str]
    tool_overrides: dict[str, str]
    max_tool_calls_per_minute: int
    max_tool_calls_per_execution: int
    skill_ids: list[str]
    retrieval_enabled: bool
    retrieval_limit: int
    retrieval_score_threshold: float
    knowledge_scope: KnowledgeScope
    is_system: bool
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]


class CapabilityBundleListResponse(BaseModel):
    """Schema for list of capability bundles."""
    bundles: list[CapabilityBundleResponse]
    total: int
