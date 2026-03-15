"""Evaluation domain API router - scenarios, runs, baselines, and comparisons."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db
from openforge.evaluation.comparisons import compare_runs as compare_runs_fn
from openforge.evaluation.schemas import (
    EvaluationBaselineCreate,
    EvaluationBaselineListResponse,
    EvaluationBaselineResponse,
    EvaluationResultListResponse,
    EvaluationRunCreate,
    EvaluationRunListResponse,
    EvaluationRunResponse,
    EvaluationScenarioCreate,
    EvaluationScenarioListResponse,
    EvaluationScenarioResponse,
    EvaluationScenarioUpdate,
    RegressionCheckResult,
)
from openforge.evaluation.service import EvaluationService

from .schemas import CompareRunsRequest, RunComparisonResponse

router = APIRouter()

evaluation_service = EvaluationService()


# -- Scenarios ----------------------------------------------------------------


@router.get("/scenarios", response_model=EvaluationScenarioListResponse)
async def list_scenarios(
    suite_name: str | None = None,
    is_active: bool | None = None,
    tags: list[str] = Query(default=[]),
    db=Depends(get_db),
):
    """List evaluation scenarios with optional filters."""
    items = await evaluation_service.list_scenarios(
        db,
        suite_name=suite_name,
        is_active=is_active,
        tags=tags or None,
    )
    return {"items": items, "count": len(items)}


@router.get("/scenarios/{scenario_id}", response_model=EvaluationScenarioResponse)
async def get_scenario(
    scenario_id: UUID,
    db=Depends(get_db),
):
    """Get a single evaluation scenario by ID."""
    scenario = await evaluation_service.get_scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation scenario not found",
        )
    return scenario


@router.post(
    "/scenarios",
    response_model=EvaluationScenarioResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scenario(
    body: EvaluationScenarioCreate,
    db=Depends(get_db),
):
    """Create a new evaluation scenario."""
    return await evaluation_service.create_scenario(db, body.model_dump())


@router.patch("/scenarios/{scenario_id}", response_model=EvaluationScenarioResponse)
async def update_scenario(
    scenario_id: UUID,
    body: EvaluationScenarioUpdate,
    db=Depends(get_db),
):
    """Update an existing evaluation scenario."""
    scenario = await evaluation_service.update_scenario(
        db, scenario_id, body.model_dump(exclude_unset=True)
    )
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation scenario not found",
        )
    return scenario


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: UUID,
    db=Depends(get_db),
):
    """Delete an evaluation scenario."""
    success = await evaluation_service.delete_scenario(db, scenario_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation scenario not found",
        )
    return None


# -- Evaluation Runs ----------------------------------------------------------


@router.get("/runs", response_model=EvaluationRunListResponse)
async def list_evaluation_runs(
    suite_name: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db=Depends(get_db),
):
    """List evaluation runs with optional filters."""
    items, count = await evaluation_service.list_evaluation_runs(
        db,
        suite_name=suite_name,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "count": count}


@router.get("/runs/{eval_run_id}", response_model=EvaluationRunResponse)
async def get_evaluation_run(
    eval_run_id: UUID,
    db=Depends(get_db),
):
    """Get a single evaluation run by ID."""
    run = await evaluation_service.get_evaluation_run(db, eval_run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation run not found",
        )
    return run


@router.post(
    "/runs",
    response_model=EvaluationRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_evaluation_run(
    body: EvaluationRunCreate,
    db=Depends(get_db),
):
    """Create a new evaluation run."""
    data = body.model_dump()
    return await evaluation_service.create_evaluation_run(
        db,
        suite_name=data.get("suite_name"),
        workspace_id=data.get("workspace_id"),
        baseline_id=data.get("baseline_id"),
        metadata=data.get("metadata"),
    )


@router.get("/runs/{eval_run_id}/results", response_model=EvaluationResultListResponse)
async def list_evaluation_results(
    eval_run_id: UUID,
    db=Depends(get_db),
):
    """List results for a specific evaluation run."""
    items = await evaluation_service.list_evaluation_results(db, eval_run_id)
    return {"items": items, "count": len(items)}


# -- Baselines ----------------------------------------------------------------


@router.get("/baselines", response_model=EvaluationBaselineListResponse)
async def list_baselines(
    suite_name: str | None = None,
    is_active: bool | None = None,
    db=Depends(get_db),
):
    """List evaluation baselines with optional filters."""
    items = await evaluation_service.list_baselines(
        db,
        suite_name=suite_name,
        is_active=is_active,
    )
    return {"items": items, "count": len(items)}


@router.get("/baselines/{baseline_id}", response_model=EvaluationBaselineResponse)
async def get_baseline(
    baseline_id: UUID,
    db=Depends(get_db),
):
    """Get a single baseline by ID."""
    baseline = await evaluation_service.get_baseline(db, baseline_id)
    if baseline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation baseline not found",
        )
    return baseline


@router.post(
    "/baselines",
    response_model=EvaluationBaselineResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_baseline(
    body: EvaluationBaselineCreate,
    db=Depends(get_db),
):
    """Create a new evaluation baseline."""
    return await evaluation_service.create_baseline(db, body.model_dump())


@router.post("/baselines/{baseline_id}/check", response_model=RegressionCheckResult)
async def check_regression(
    baseline_id: UUID,
    eval_run_id: UUID = Query(..., description="Evaluation run ID to check against baseline"),
    db=Depends(get_db),
):
    """Check for regressions against a baseline."""
    result = await evaluation_service.check_regression(db, eval_run_id, baseline_id)
    return result


# -- Comparison ---------------------------------------------------------------


@router.post("/compare-runs", response_model=RunComparisonResponse)
async def compare_evaluation_runs(
    body: CompareRunsRequest,
    db=Depends(get_db),
):
    """Compare two evaluation runs side-by-side."""
    run_a = await evaluation_service.get_evaluation_run(db, body.run_a_id)
    if run_a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evaluation run {body.run_a_id} not found",
        )
    run_b = await evaluation_service.get_evaluation_run(db, body.run_b_id)
    if run_b is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evaluation run {body.run_b_id} not found",
        )

    comparison = compare_runs_fn(run_a, run_b)
    return RunComparisonResponse(
        run_a_id=body.run_a_id,
        run_b_id=body.run_b_id,
        metric_deltas=comparison,
        scenario_diffs=[],
        summary=f"Compared run {body.run_a_id} vs {body.run_b_id}",
    )
