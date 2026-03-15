"""Pydantic schemas specific to the evaluation domain router."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CompareRunsRequest(BaseModel):
    run_a_id: UUID
    run_b_id: UUID


class RunComparisonResponse(BaseModel):
    run_a_id: UUID
    run_b_id: UUID
    metric_deltas: dict[str, Any] = Field(default_factory=dict)
    scenario_diffs: list[dict[str, Any]] = Field(default_factory=list)
    summary: str = ""
