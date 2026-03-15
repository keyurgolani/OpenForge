"""Workflow API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import NodeType

from .types import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowEdgeStatus,
    WorkflowNode,
    WorkflowNodeStatus,
    WorkflowStatus,
    WorkflowVersion,
    WorkflowVersionStatus,
)


class WorkflowNodeCreate(BaseModel):
    id: UUID | None = None
    node_key: str = Field(min_length=1, max_length=120)
    node_type: NodeType
    label: str = Field(min_length=1, max_length=255)
    description: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    executor_ref: str | None = None
    input_mapping: dict[str, Any] = Field(default_factory=dict)
    output_mapping: dict[str, Any] = Field(default_factory=dict)
    status: WorkflowNodeStatus = WorkflowNodeStatus.ACTIVE


class WorkflowNodeUpdate(BaseModel):
    node_key: str | None = Field(default=None, min_length=1, max_length=120)
    node_type: NodeType | None = None
    label: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    config: dict[str, Any] | None = None
    executor_ref: str | None = None
    input_mapping: dict[str, Any] | None = None
    output_mapping: dict[str, Any] | None = None
    status: WorkflowNodeStatus | None = None


class WorkflowEdgeCreate(BaseModel):
    id: UUID | None = None
    from_node_id: UUID
    to_node_id: UUID
    edge_type: str = Field(default="success", min_length=1, max_length=50)
    condition: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=100)
    label: str | None = None
    status: WorkflowEdgeStatus = WorkflowEdgeStatus.ACTIVE


class WorkflowEdgeUpdate(BaseModel):
    from_node_id: UUID | None = None
    to_node_id: UUID | None = None
    edge_type: str | None = Field(default=None, min_length=1, max_length=50)
    condition: dict[str, Any] | None = None
    priority: int | None = None
    label: str | None = None
    status: WorkflowEdgeStatus | None = None


class WorkflowVersionCreate(BaseModel):
    state_schema: dict[str, Any] = Field(default_factory=dict)
    entry_node_id: UUID | None = None
    default_input_schema: dict[str, Any] = Field(default_factory=dict)
    default_output_schema: dict[str, Any] = Field(default_factory=dict)
    status: WorkflowVersionStatus = WorkflowVersionStatus.DRAFT
    change_note: str | None = None
    nodes: list[WorkflowNodeCreate] = Field(default_factory=list)
    edges: list[WorkflowEdgeCreate] = Field(default_factory=list)


class WorkflowCreate(BaseModel):
    workspace_id: UUID
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    status: WorkflowStatus = WorkflowStatus.DRAFT
    is_system: bool = False
    is_template: bool = False
    template_kind: str | None = Field(default=None, max_length=80)
    template_metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    is_featured: bool = False
    is_recommended: bool = False
    sort_priority: int = 0
    icon: str | None = Field(default=None, max_length=100)
    version: WorkflowVersionCreate


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    status: WorkflowStatus | None = None
    is_system: bool | None = None
    is_template: bool | None = None
    template_kind: str | None = Field(default=None, max_length=80)
    template_metadata: dict[str, Any] | None = None
    tags: list[str] | None = None
    is_featured: bool | None = None
    is_recommended: bool | None = None
    sort_priority: int | None = None
    icon: str | None = Field(default=None, max_length=100)


class WorkflowTemplateCloneRequest(BaseModel):
    workspace_id: UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)


class WorkflowResponse(WorkflowDefinition):
    model_config = ConfigDict(from_attributes=True)


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowResponse]
    total: int


class WorkflowVersionResponse(WorkflowVersion):
    model_config = ConfigDict(from_attributes=True)


class WorkflowVersionListResponse(BaseModel):
    versions: list[WorkflowVersionResponse]
    total: int


class WorkflowNodeResponse(WorkflowNode):
    model_config = ConfigDict(from_attributes=True)


class WorkflowNodeListResponse(BaseModel):
    nodes: list[WorkflowNodeResponse]
    total: int


class WorkflowEdgeResponse(WorkflowEdge):
    model_config = ConfigDict(from_attributes=True)


class WorkflowEdgeListResponse(BaseModel):
    edges: list[WorkflowEdgeResponse]
    total: int
