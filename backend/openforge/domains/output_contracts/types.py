"""Output Contract domain types."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field
from enum import Enum


class ExecutionMode(str, Enum):
    """Execution mode for the agent."""
    STREAMING = "streaming"
    BATCH = "batch"
    INTERACTIVE = "interactive"


class OutputContract(BaseModel):
    """Contract defining expected output format and behavior."""
    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.STREAMING)
    require_structured_output: bool = Field(default=False)
    output_schema: Optional[dict[str, Any]] = Field(default=None)
    require_citations: bool = Field(default=False)
    is_system: bool = Field(default=False)
    status: str = Field(default="active")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None
