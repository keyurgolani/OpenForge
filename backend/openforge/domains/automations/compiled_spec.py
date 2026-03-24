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
    wired_inputs: dict[str, dict] = Field(default_factory=dict)     # input_key -> {source_node_key, source_output_key}
    static_inputs: dict[str, Any] = Field(default_factory=dict)     # input_key -> value
    unfilled_inputs: list[dict] = Field(default_factory=list)       # remaining required inputs


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

    # Resolved budget
    max_runs_per_day: Optional[int] = None
    max_concurrent_runs: Optional[int] = None
    max_token_budget_per_day: Optional[int] = None
    cooldown_seconds_after_failure: Optional[int] = None

    # Output routing
    artifact_types: list[str] = Field(default_factory=list)

    # Multi-node graph
    is_multi_node: bool = False
    nodes: list[CompiledNodeSpec] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    execution_levels: list[list[str]] = Field(default_factory=list)
    deployment_input_schema: list[dict] = Field(default_factory=list)

    # References
    trigger_id: Optional[UUID] = None
    compiler_version: str = "1.0.0"
