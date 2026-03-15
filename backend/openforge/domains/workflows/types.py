"""Workflow domain types."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from openforge.domains.common.enums import NodeType


class WorkflowStatus(str, Enum):
    """Top-level workflow definition status."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class WorkflowVersionStatus(str, Enum):
    """Lifecycle state for a workflow version."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    SUPERSEDED = "superseded"


class WorkflowNodeStatus(str, Enum):
    """Workflow node status."""

    ACTIVE = "active"
    DISABLED = "disabled"


class WorkflowEdgeStatus(str, Enum):
    """Workflow edge status."""

    ACTIVE = "active"
    DISABLED = "disabled"


class WorkflowNode(BaseModel):
    """Executable node within a workflow version."""

    id: UUID
    workflow_version_id: UUID
    node_key: str = Field(min_length=1, max_length=120)
    node_type: NodeType
    label: str = Field(min_length=1, max_length=255)
    description: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    executor_ref: str | None = None
    input_mapping: dict[str, Any] = Field(default_factory=dict)
    output_mapping: dict[str, Any] = Field(default_factory=dict)
    status: WorkflowNodeStatus = WorkflowNodeStatus.ACTIVE
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowEdge(BaseModel):
    """Directed edge between workflow nodes."""

    id: UUID
    workflow_version_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    edge_type: str = Field(default="success", min_length=1, max_length=50)
    condition: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=100)
    label: str | None = None
    status: WorkflowEdgeStatus = WorkflowEdgeStatus.ACTIVE
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowVersion(BaseModel):
    """Versioned executable graph snapshot."""

    id: UUID
    workflow_id: UUID
    version_number: int = Field(ge=1)
    state_schema: dict[str, Any] = Field(default_factory=dict)
    entry_node_id: UUID | None = None
    entry_node: WorkflowNode | None = None
    default_input_schema: dict[str, Any] = Field(default_factory=dict)
    default_output_schema: dict[str, Any] = Field(default_factory=dict)
    status: WorkflowVersionStatus = WorkflowVersionStatus.DRAFT
    change_note: str | None = None
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowDefinition(BaseModel):
    """Top-level workflow definition and current executable projection."""

    id: UUID
    workspace_id: UUID | None = None
    name: str
    slug: str
    description: str | None = None
    status: WorkflowStatus = WorkflowStatus.DRAFT
    current_version_id: UUID | None = None
    is_system: bool = False
    is_template: bool = False
    template_kind: str | None = None
    template_metadata: dict[str, Any] = Field(default_factory=dict)
    current_version: WorkflowVersion | None = None
    version: int = Field(default=1, ge=1)
    entry_node: str | None = None
    state_schema: dict[str, Any] = Field(default_factory=dict)
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    default_input_schema: dict[str, Any] = Field(default_factory=dict)
    default_output_schema: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)
