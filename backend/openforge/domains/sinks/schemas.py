"""Sink API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# Valid sink types per vision doc section 7.2
VALID_SINK_TYPES = {"article", "knowledge_create", "knowledge_update", "rest_api", "notification", "log"}


class SinkCreate(BaseModel):
    """Schema for creating a sink definition."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    sink_type: str = Field(..., max_length=50)
    config: dict[str, Any] = Field(default_factory=dict)
    icon: Optional[str] = Field(default=None, max_length=100)
    tags: list[str] = Field(default_factory=list)


class SinkUpdate(BaseModel):
    """Schema for updating a sink definition."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    sink_type: Optional[str] = Field(default=None, max_length=50)
    config: Optional[dict[str, Any]] = None
    icon: Optional[str] = Field(default=None, max_length=100)
    tags: Optional[list[str]] = None


class SinkResponse(BaseModel):
    """Sink response with all fields."""

    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    sink_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    icon: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SinkListResponse(BaseModel):
    """Schema for sink list response."""

    sinks: list[SinkResponse]
    total: int
