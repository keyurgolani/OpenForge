"""Output Contract schemas for API request and response models."""

from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field
from .types import OutputContract, ExecutionMode


class OutputContractCreate(BaseModel):
    """Schema for creating a new output contract."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.STREAMING)
    require_structured_output: bool = Field(default=False)
    output_schema: Optional[dict[str, Any]] = Field(default=None)
    require_citations: bool = Field(default=False)


class OutputContractUpdate(BaseModel):
    """Schema for updating an existing output contract."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    execution_mode: Optional[ExecutionMode] = None
    require_structured_output: Optional[bool] = None
    output_schema: Optional[dict[str, Any]] = None
    require_citations: Optional[bool] = None
    is_system: Optional[bool] = None
    status: Optional[str] = None


class OutputContractResponse(BaseModel):
    """Schema for output contract API responses."""
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    execution_mode: ExecutionMode
    require_structured_output: bool
    output_schema: Optional[dict[str, Any]]
    require_citations: bool
    is_system: bool
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class OutputContractListResponse(BaseModel):
    """Schema for list of output contracts."""
    contracts: list[OutputContractResponse]
    total: int
