"""Run domain API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import (
    CheckpointListResponse,
    CompositeDebugResponse,
    RunCreate,
    RunLineageResponse,
    RunListResponse,
    RunResponse,
    RunResumeRequest,
    RunStartRequest,
    RunStepListResponse,
    RunUpdate,
    RuntimeEventListResponse,
)
from .service import RunService

router = APIRouter()


def get_run_service(db=Depends(get_db)) -> RunService:
    return RunService(db)


@router.get("/", response_model=RunListResponse)
async def list_runs(
    skip: int = 0,
    limit: int = 100,
    workspace_id: UUID | None = None,
    status: str | None = None,
    run_type: str | None = None,
    service: RunService = Depends(get_run_service),
):
    list_kwargs = {"skip": skip, "limit": limit}
    if workspace_id is not None:
        list_kwargs["workspace_id"] = workspace_id
    if status is not None:
        list_kwargs["status"] = status
    if run_type is not None:
        list_kwargs["run_type"] = run_type
    runs, total = await service.list_runs(**list_kwargs)
    return {"runs": runs, "total": total}


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: UUID, service: RunService = Depends(get_run_service)):
    run = await service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.post("/", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(body: RunCreate, service: RunService = Depends(get_run_service)):
    return await service.create_run(body.model_dump())


@router.patch("/{run_id}", response_model=RunResponse)
async def update_run(run_id: UUID, body: RunUpdate, service: RunService = Depends(get_run_service)):
    run = await service.update_run(run_id, body.model_dump(exclude_unset=True))
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: UUID, service: RunService = Depends(get_run_service)):
    success = await service.delete_run(run_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return None


@router.post("/start", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def start_run(body: RunStartRequest, service: RunService = Depends(get_run_service)):
    run = await service.start_run(body.model_dump())
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return run


@router.post("/{run_id}/resume", response_model=RunResponse)
async def resume_run(run_id: UUID, body: RunResumeRequest | None = None, service: RunService = Depends(get_run_service)):
    state_patch = (body.model_dump() if body else {}).get("state_patch", {})
    if state_patch:
        run = await service.resume_run(run_id, state_patch)
    else:
        run = await service.resume_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.post("/{run_id}/cancel", response_model=RunResponse)
async def cancel_run(run_id: UUID, service: RunService = Depends(get_run_service)):
    run = await service.cancel_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.get("/{run_id}/steps", response_model=RunStepListResponse)
async def list_run_steps(run_id: UUID, service: RunService = Depends(get_run_service)):
    steps = await service.list_steps(run_id)
    return {"steps": steps, "total": len(steps)}


@router.get("/{run_id}/lineage", response_model=RunLineageResponse)
async def get_run_lineage(run_id: UUID, service: RunService = Depends(get_run_service)):
    return await service.get_lineage(run_id)


@router.get("/{run_id}/checkpoints", response_model=CheckpointListResponse)
async def list_run_checkpoints(run_id: UUID, service: RunService = Depends(get_run_service)):
    checkpoints = await service.list_checkpoints(run_id)
    return {"checkpoints": checkpoints, "total": len(checkpoints)}


@router.get("/{run_id}/events", response_model=RuntimeEventListResponse)
async def list_run_events(run_id: UUID, service: RunService = Depends(get_run_service)):
    events = await service.list_events(run_id)
    return {"events": events, "total": len(events)}


@router.get("/{run_id}/composite", response_model=CompositeDebugResponse)
async def get_run_composite_debug(run_id: UUID, service: RunService = Depends(get_run_service)):
    return await service.get_composite_debug(run_id)
