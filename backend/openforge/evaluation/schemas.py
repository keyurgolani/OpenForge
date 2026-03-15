"""Pydantic schemas for the evaluation domain."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EvaluationScenarioCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    suite_name: str
    scenario_type: str = "golden_task"
    input_payload: dict[str, Any] = Field(default_factory=dict)
    expected_behaviors: list[str] = Field(default_factory=list)
    expected_output_constraints: dict[str, Any] = Field(default_factory=dict)
    workflow_template_id: Optional[UUID] = None
    profile_template_id: Optional[UUID] = None
    mission_template_id: Optional[UUID] = None
    evaluation_metrics: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class EvaluationScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    suite_name: Optional[str] = None
    input_payload: Optional[dict[str, Any]] = None
    expected_behaviors: Optional[list[str]] = None
    expected_output_constraints: Optional[dict[str, Any]] = None
    workflow_template_id: Optional[UUID] = None
    profile_template_id: Optional[UUID] = None
    mission_template_id: Optional[UUID] = None
    evaluation_metrics: Optional[list[dict[str, Any]]] = None
    tags: Optional[list[str]] = None
    is_active: Optional[bool] = None


class EvaluationScenarioResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    suite_name: str
    scenario_type: str
    input_payload: dict[str, Any]
    expected_behaviors: list[str]
    expected_output_constraints: dict[str, Any]
    workflow_template_id: Optional[UUID]
    profile_template_id: Optional[UUID]
    mission_template_id: Optional[UUID]
    evaluation_metrics: list[dict[str, Any]]
    tags: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationScenarioListResponse(BaseModel):
    items: list[EvaluationScenarioResponse]
    count: int


class EvaluationRunCreate(BaseModel):
    workspace_id: Optional[UUID] = None
    suite_name: Optional[str] = None
    scenario_ids: list[UUID] = Field(default_factory=list)
    baseline_id: Optional[UUID] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvaluationRunResponse(BaseModel):
    id: UUID
    workspace_id: Optional[UUID]
    suite_name: Optional[str]
    status: str
    scenario_count: int
    passed_count: int
    failed_count: int
    skipped_count: int
    total_cost_usd: Optional[float]
    total_tokens: int
    baseline_id: Optional[UUID]
    metadata: dict[str, Any]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationRunListResponse(BaseModel):
    items: list[EvaluationRunResponse]
    count: int


class EvaluationResultResponse(BaseModel):
    id: UUID
    evaluation_run_id: UUID
    scenario_id: UUID
    run_id: Optional[UUID]
    status: str
    metrics: dict[str, Any]
    threshold_results: dict[str, Any]
    output_summary: Optional[str]
    comparison_baseline: dict[str, Any]
    artifacts_produced: list[str]
    cost_usd: Optional[float]
    tokens_used: int
    duration_ms: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationResultListResponse(BaseModel):
    items: list[EvaluationResultResponse]
    count: int


class EvaluationBaselineCreate(BaseModel):
    suite_name: str
    name: str
    description: Optional[str] = None
    source_evaluation_run_id: Optional[UUID] = None
    metrics_snapshot: dict[str, Any] = Field(default_factory=dict)
    thresholds: dict[str, Any] = Field(default_factory=dict)


class EvaluationBaselineResponse(BaseModel):
    id: UUID
    suite_name: str
    name: str
    description: Optional[str]
    source_evaluation_run_id: Optional[UUID]
    metrics_snapshot: dict[str, Any]
    thresholds: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationBaselineListResponse(BaseModel):
    items: list[EvaluationBaselineResponse]
    count: int


class RegressionCheckResult(BaseModel):
    baseline_id: UUID
    baseline_name: str
    regressions: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    passed: bool
