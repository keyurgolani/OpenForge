"""Compiled automation specification model.

Fully resolved, immutable automation configuration.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CompiledAutomationSpec(BaseModel):
    """Fully resolved, immutable automation configuration."""

    automation_id: UUID
    automation_slug: str
    name: str
    agent_id: UUID
    agent_spec_id: UUID
    agent_spec_version: int

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

    # References
    trigger_id: Optional[UUID] = None
    compiler_version: str = "1.0.0"
