"""Pydantic schemas for observability endpoints."""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UsageSummaryResponse(BaseModel):
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_reasoning_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_requests: int = 0
    total_tool_calls: int = 0
    total_llm_calls: int = 0
    avg_latency_ms: Optional[float] = None
    model_breakdown: dict[str, Any] = Field(default_factory=dict)
    tool_breakdown: dict[str, Any] = Field(default_factory=dict)
    failure_count: int = 0


class CostHotspot(BaseModel):
    workflow_id: Optional[str] = None
    mission_id: Optional[str] = None
    profile_id: Optional[str] = None
    model_name: Optional[str] = None
    total_cost: float = 0.0
    total_tokens: int = 0
    request_count: int = 0


class CostHotspotsResponse(BaseModel):
    items: list[CostHotspot]
    count: int


class FailureEventResponse(BaseModel):
    id: str
    failure_class: str
    error_code: str
    severity: str
    retryability: str
    summary: str
    detail: dict[str, Any] = Field(default_factory=dict)
    affected_node_key: Optional[str] = None
    workspace_id: Optional[str] = None
    run_id: Optional[str] = None
    step_id: Optional[str] = None
    workflow_id: Optional[str] = None
    mission_id: Optional[str] = None
    trigger_id: Optional[str] = None
    related_policy_id: Optional[str] = None
    related_approval_id: Optional[str] = None
    resolved: bool = False
    created_at: Optional[str] = None


class FailureListResponse(BaseModel):
    items: list[FailureEventResponse]
    count: int


class FailureRollupItem(BaseModel):
    group_key: str
    count: int
    severity: Optional[str] = None
    retryability: Optional[str] = None
    last_seen: Optional[str] = None


class FailureRollupResponse(BaseModel):
    items: list[FailureRollupItem]
    count: int
    group_by: str


class RunTelemetrySummary(BaseModel):
    run_id: UUID
    usage: UsageSummaryResponse
    failures: FailureListResponse
    event_count: int = 0
    step_count: int = 0
    artifact_count: int = 0
    child_run_count: int = 0
