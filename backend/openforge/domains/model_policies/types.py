"""Model Policy domain types."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ModelPolicy(BaseModel):
    """Policy for LLM model selection and usage constraints."""
    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    default_provider_id: Optional[UUID] = Field(default=None)
    default_model: Optional[str] = Field(default=None, max_length=200)
    allow_runtime_override: bool = Field(default=True)
    allowed_models: list[str] = Field(default_factory=list)
    blocked_models: list[str] = Field(default_factory=list)
    max_tokens_per_request: Optional[int] = Field(default=None)
    max_tokens_per_day: Optional[int] = Field(default=None)
    is_system: bool = Field(default=False)
    status: str = Field(default="active")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None
