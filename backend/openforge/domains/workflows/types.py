"""
Workflow domain types.

This module defines the core types and enums for Workflow Definitions.
"""

from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class WorkflowStatus(str, Enum):
    """Status of a workflow definition."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class NodeType(str, Enum):
    """Types of nodes in a workflow graph."""

    LLM = "llm"  # LLM inference node
    TOOL = "tool"  # Tool execution node
    ROUTER = "router"  # Conditional routing node
    APPROVAL = "approval"  # Human approval node
    ARTIFACT = "artifact"  # Artifact generation node
    SUBWORKFLOW = "subworkflow"  # Nested workflow node
    INPUT = "input"  # Input node
    OUTPUT = "output"  # Output node
    TRANSFORM = "transform"  # Data transformation node


class WorkflowNode(BaseModel):
    """A node in the workflow graph."""

    id: str = Field(..., min_length=1, max_length=100)
    node_type: NodeType = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    config: dict[str, Any] = Field(default_factory=dict)
    position_x: Optional[int] = Field(default=None)
    position_y: Optional[int] = Field(default=None)


class WorkflowEdge(BaseModel):
    """An edge in the workflow graph."""

    id: str = Field(..., min_length=1, max_length=100)
    source_node_id: str = Field(..., min_length=1)
    target_node_id: str = Field(..., min_length=1)
    condition: Optional[dict[str, Any]] = Field(default=None)
    label: Optional[str] = Field(default=None, max_length=255)


class WorkflowDefinition(BaseModel):
    """
    Workflow Definition - a composable execution graph.

    A Workflow defines how tasks are performed through a graph of nodes and edges.
    It is NOT a runtime instance - it's the definition/blueprint.

    Attributes:
        id: Unique identifier
        name: Display name
        slug: URL-friendly identifier
        description: Human-readable description
        version: Version number for this workflow definition
        entry_node: ID of the starting node
        state_schema: JSON schema for workflow state
        nodes: List of workflow nodes
        edges: List of edges connecting nodes
        default_input_schema: JSON schema for expected inputs
        default_output_schema: JSON schema for outputs
        status: Current status
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: User who created this workflow
        updated_by: User who last updated this workflow
    """

    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    version: int = Field(default=1, ge=1)
    entry_node: Optional[str] = Field(default=None, max_length=100)
    state_schema: dict[str, Any] = Field(default_factory=dict)
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    default_input_schema: dict[str, Any] = Field(default_factory=dict)
    default_output_schema: dict[str, Any] = Field(default_factory=dict)
    status: WorkflowStatus = Field(default=WorkflowStatus.DRAFT)

    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)

    class Config:
        from_attributes = True
