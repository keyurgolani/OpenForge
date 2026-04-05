"""Mission domain API schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MissionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    goal: str
    directives: list[str] = Field(default_factory=list)
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    rubric: list[dict[str, Any]] = Field(default_factory=list)
    termination_conditions: list[dict[str, Any]] = Field(default_factory=list)
    autonomous_agent_id: UUID
    agent_access: dict[str, Any] = Field(default_factory=lambda: {"mode": "all"})
    tool_overrides: Optional[dict[str, Any]] = None
    phase_sinks: dict[str, Any] = Field(default_factory=dict)
    cadence: Optional[dict[str, Any]] = None
    budget: Optional[dict[str, Any]] = None


class MissionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    tags: Optional[list[str]] = None
    goal: Optional[str] = None
    directives: Optional[list[str]] = None
    constraints: Optional[list[dict[str, Any]]] = None
    rubric: Optional[list[dict[str, Any]]] = None
    termination_conditions: Optional[list[dict[str, Any]]] = None
    autonomous_agent_id: Optional[UUID] = None
    agent_access: Optional[dict[str, Any]] = None
    tool_overrides: Optional[dict[str, Any]] = None
    phase_sinks: Optional[dict[str, Any]] = None
    cadence: Optional[dict[str, Any]] = None
    budget: Optional[dict[str, Any]] = None


class MissionResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    goal: str
    directives: list[str] = Field(default_factory=list)
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    rubric: list[dict[str, Any]] = Field(default_factory=list)
    termination_conditions: list[dict[str, Any]] = Field(default_factory=list)
    autonomous_agent_id: UUID
    agent_access: dict[str, Any] = Field(default_factory=lambda: {"mode": "all"})
    tool_overrides: Optional[dict[str, Any]] = None
    phase_sinks: dict[str, Any] = Field(default_factory=dict)
    owned_workspace_id: Optional[UUID] = None
    cadence: Optional[dict[str, Any]] = None
    budget: Optional[dict[str, Any]] = None
    status: str
    current_plan: Optional[dict[str, Any]] = None
    cycle_count: int = 0
    tokens_used: int = 0
    cost_estimate: float = 0.0
    last_cycle_at: Optional[datetime] = None
    next_cycle_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MissionCycleResponse(BaseModel):
    id: UUID
    mission_id: UUID
    cycle_number: int
    phase: str
    phase_summaries: dict[str, Any] = Field(default_factory=dict)
    actions_log: list[dict[str, Any]] = Field(default_factory=list)
    evaluation_scores: Optional[dict[str, Any]] = None
    ratchet_passed: Optional[bool] = None
    next_cycle_requested_at: Optional[datetime] = None
    next_cycle_reason: Optional[str] = None
    primary_run_id: Optional[UUID] = None
    tokens_used: int = 0
    cost_estimate: float = 0.0
    duration_seconds: Optional[float] = None
    status: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MissionListResponse(BaseModel):
    missions: list[MissionResponse]
    total: int
