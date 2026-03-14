"""
Workflow schemas for API request/response models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from backend.openforge.domains.workflows.types import (
    NodeType,
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowNode,
    WorkflowStatus,
)


class WorkflowNodeCreate(BaseModel):
    """Schema for creating a workflow node."""

    id: str = Field(..., min_length=1, max_length=100)
    node_type: NodeType = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    config: dict[str, Any] = Field(default_factory=dict)
    position_x: Optional[int] = Field(default=None)
    position_y: Optional[int] = Field(default=None)


class WorkflowEdgeCreate(BaseModel):
    """Schema for creating a workflow edge."""

    id: str = Field(..., min_length=1, max_length=100)
    source_node_id: str = Field(..., min_length=1)
    target_node_id: str = Field(..., min_length=1)
    condition: Optional[dict[str, Any]] = Field(default=None)
    label: Optional[str] = Field(default=None, max_length=255)


class WorkflowCreate(BaseModel):
    """Schema for creating a workflow definition."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    version: int = Field(default=1, ge=1)
    entry_node: Optional[str] = Field(default=None, max_length=100)
    state_schema: dict[str, Any] = Field(default_factory=dict)
    nodes: list[WorkflowNodeCreate] = Field(default_factory=list)
    edges: list[WorkflowEdgeCreate] = Field(default_factory=list)
    default_input_schema: dict[str, Any] = Field(default_factory=dict)
    default_output_schema: dict[str, Any] = Field(default_factory=dict)
    status: WorkflowStatus = Field(default=WorkflowStatus.DRAFT)


class WorkflowUpdate(BaseModel):
    """Schema for updating a workflow definition."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    version: Optional[int] = Field(default=None, ge=1)
    entry_node: Optional[str] = Field(default=None, max_length=100)
    state_schema: Optional[dict[str, Any]] = Field(default=None)
    nodes: Optional[list[WorkflowNodeCreate]] = Field(default=None)
    edges: Optional[list[WorkflowEdgeCreate]] = Field(default=None)
    default_input_schema: Optional[dict[str, Any]] = Field(default=None)
    default_output_schema: Optional[dict[str, Any]] = Field(default=None)
    status: Optional[WorkflowStatus] = Field(default=None)


class WorkflowResponse(BaseModel):
    """Schema for workflow response."""

    id: UUID
    name: str
    slug: str
    description: Optional[str]
    version: int
    entry_node: Optional[str]
    state_schema: dict[str, Any]
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    default_input_schema: dict[str, Any]
    default_output_schema: dict[str, Any]
    status: WorkflowStatus
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    """Schema for workflow list response."""

    workflows: list[WorkflowResponse]
    total: int
