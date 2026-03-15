"""Memory Policy schemas for API request and response models."""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from .types import MemoryPolicy, HistoryStrategy


class MemoryPolicyCreate(BaseModel):
    """Schema for creating a new memory policy."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    history_limit: int = Field(default=20, ge=1, le=1000)
    history_strategy: HistoryStrategy = Field(default=HistoryStrategy.SLIDING_WINDOW)
    attachment_support: bool = Field(default=True)
    auto_bookmark_urls: bool = Field(default=True)
    mention_support: bool = Field(default=True)


class MemoryPolicyUpdate(BaseModel):
    """Schema for updating an existing memory policy."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    history_limit: Optional[int] = Field(default=None, ge=1, le=1000)
    history_strategy: Optional[HistoryStrategy] = None
    attachment_support: Optional[bool] = None
    auto_bookmark_urls: Optional[bool] = None
    mention_support: Optional[bool] = None
    is_system: Optional[bool] = None
    status: Optional[str] = None


class MemoryPolicyResponse(BaseModel):
    """Schema for memory policy API responses."""
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    history_limit: int
    history_strategy: HistoryStrategy
    attachment_support: bool
    auto_bookmark_urls: bool
    mention_support: bool
    is_system: bool
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class MemoryPolicyListResponse(BaseModel):
    """Schema for list of memory policies."""
    policies: list[MemoryPolicyResponse]
    total: int
