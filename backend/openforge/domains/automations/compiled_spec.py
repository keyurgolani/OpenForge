"""Compiled automation specification model.

Fully resolved, immutable automation configuration.
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CompiledNodeSpec(BaseModel):
    """Resolved spec for a single node in a multi-node automation."""

    node_key: str
    agent_id: UUID
    agent_spec_id: UUID
    input_schema: list[dict] = Field(default_factory=list)
    output_definitions: list[dict] = Field(default_factory=lambda: [{"key": "output", "type": "text"}])
    wired_inputs: dict[str, Any] = Field(default_factory=dict)       # input_key -> dict (single) or list[dict] (fan-in)
    static_inputs: dict[str, Any] = Field(default_factory=dict)     # input_key -> value
    unfilled_inputs: list[dict] = Field(default_factory=list)       # remaining required inputs


class CompiledSinkNodeSpec(BaseModel):
    """Resolved spec for a single sink node in a multi-node automation."""

    node_key: str
    sink_type: str                          # "article", "knowledge_create", etc.
    sink_id: Optional[UUID] = None          # reference to SinkModel if user picked a saved sink
    config: dict[str, Any] = Field(default_factory=dict)  # hardcoded defaults from SinkModel
    input_schema: list[dict] = Field(default_factory=list)
    wired_inputs: dict[str, Any] = Field(default_factory=dict)
    static_inputs: dict[str, Any] = Field(default_factory=dict)


class CompiledAutomationSpec(BaseModel):
    """Fully resolved, immutable automation configuration."""

    automation_id: UUID
    automation_slug: str
    name: str
    agent_id: Optional[UUID] = None
    agent_spec_id: Optional[UUID] = None
    agent_spec_version: Optional[int] = None

    # Resolved trigger
    trigger_type: str = "manual"
    schedule_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    event_type: Optional[str] = None

    # Multi-node graph
    is_multi_node: bool = False
    nodes: list[CompiledNodeSpec] = Field(default_factory=list)
    sink_nodes: list[CompiledSinkNodeSpec] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    execution_levels: list[list[str]] = Field(default_factory=list)
    deployment_input_schema: list[dict] = Field(default_factory=list)

    # References
    trigger_id: Optional[UUID] = None
    compiler_version: str = "1.0.0"
