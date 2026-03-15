"""Memory Policy domain types."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from enum import Enum


class HistoryStrategy(str, Enum):
    """Strategy for managing conversation history."""
    SLIDING_WINDOW = "sliding_window"
    SUMMARIZE = "summarize"
    TRUNCATE = "truncate"


class MemoryPolicy(BaseModel):
    """Policy for context assembly and memory management."""
    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    history_limit: int = Field(default=20, ge=1, le=1000)
    history_strategy: HistoryStrategy = Field(default=HistoryStrategy.SLIDING_WINDOW)
    attachment_support: bool = Field(default=True)
    auto_bookmark_urls: bool = Field(default=True)
    mention_support: bool = Field(default=True)
    is_system: bool = Field(default=False)
    status: str = Field(default="active")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None
