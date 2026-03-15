"""Observability domain API router - usage, failures, and telemetry."""

from __future__ import annotations

import dataclasses
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    ArtifactModel,
    RunModel,
    RunStepModel,
    RuntimeEventModel,
)
from openforge.db.postgres import get_db
from openforge.observability.cost_accounting import CostAccountingService
from openforge.observability.failure_recording import FailureRecordingService

from .schemas import (
    CostHotspotsResponse,
    FailureListResponse,
    FailureRollupResponse,
    RunTelemetrySummary,
    UsageSummaryResponse,
)

router = APIRouter()

# Services are stateless - instantiate at module level
cost_service = CostAccountingService()
failure_service = FailureRecordingService()


# ── Usage ────────────────────────────────────────────────────────────


@router.get("/usage/run/{run_id}", response_model=UsageSummaryResponse)
async def get_usage_for_run(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated usage summary for a single run."""
    summary = await cost_service.get_run_usage(db, run_id)
    return dataclasses.asdict(summary)


@router.get("/usage/workflow/{workflow_id}", response_model=UsageSummaryResponse)
async def get_usage_for_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated usage summary across all runs of a workflow."""
    summary = await cost_service.get_workflow_usage(db, workflow_id)
    return dataclasses.asdict(summary)


@router.get("/usage/mission/{mission_id}", response_model=UsageSummaryResponse)
async def get_usage_for_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated usage summary across all runs of a mission."""
    summary = await cost_service.get_mission_usage(db, mission_id)
    return dataclasses.asdict(summary)


@router.get("/usage/hotspots", response_model=CostHotspotsResponse)
async def get_cost_hotspots(
    workspace_id: UUID = Query(..., description="Workspace to analyze"),
    limit: int = Query(20, ge=1, le=100, description="Number of hotspots to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get top cost hotspots for a workspace, ranked by total spend."""
    items = await cost_service.get_cost_hotspots(db, workspace_id, limit=limit)
    return {"items": items, "count": len(items)}


# ── Failures ─────────────────────────────────────────────────────────


@router.get("/failures/run/{run_id}", response_model=FailureListResponse)
async def get_failures_for_run(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all failure events recorded during a run."""
    items = await failure_service.get_run_failures(db, run_id)
    return {"items": items, "count": len(items)}


@router.get("/failures/rollup", response_model=FailureRollupResponse)
async def get_failure_rollup(
    workspace_id: UUID = Query(..., description="Workspace to analyze"),
    group_by: str = Query("error_code", description="Group by field (error_code, failure_class, severity)"),
    limit: int = Query(50, ge=1, le=200, description="Max groups to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get failure rollup grouped by a specified dimension."""
    items = await failure_service.get_failure_rollup(
        db, workspace_id, group_by=group_by, limit=limit
    )
    return {"items": items, "count": len(items), "group_by": group_by}


@router.get("/failures/mission/{mission_id}", response_model=FailureListResponse)
async def get_failures_for_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all failure events across runs belonging to a mission."""
    items = await failure_service.get_mission_failures(db, mission_id)
    return {"items": items, "count": len(items)}


# ── Telemetry ────────────────────────────────────────────────────────


@router.get("/telemetry/run/{run_id}", response_model=RunTelemetrySummary)
async def get_run_telemetry(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get combined telemetry summary for a run (usage + failures + events)."""
    usage = await cost_service.get_run_usage(db, run_id)
    failures = await failure_service.get_run_failures(db, run_id)

    # Gather metadata counts from DB
    event_count_result = await db.execute(
        select(func.count()).select_from(RuntimeEventModel).where(
            RuntimeEventModel.run_id == run_id
        )
    )
    event_count = event_count_result.scalar() or 0

    step_count_result = await db.execute(
        select(func.count()).select_from(RunStepModel).where(
            RunStepModel.run_id == run_id
        )
    )
    step_count = step_count_result.scalar() or 0

    artifact_count_result = await db.execute(
        select(func.count()).select_from(ArtifactModel).where(
            ArtifactModel.source_run_id == run_id
        )
    )
    artifact_count = artifact_count_result.scalar() or 0

    child_run_count_result = await db.execute(
        select(func.count()).select_from(RunModel).where(
            RunModel.parent_run_id == run_id
        )
    )
    child_run_count = child_run_count_result.scalar() or 0

    return {
        "run_id": run_id,
        "usage": dataclasses.asdict(usage),
        "failures": {"items": failures, "count": len(failures)},
        "event_count": event_count,
        "step_count": step_count,
        "artifact_count": artifact_count,
        "child_run_count": child_run_count,
    }
