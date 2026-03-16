"""
Mission domain API router.

Provides endpoints for mission CRUD, lifecycle transitions, launching,
health monitoring, and diagnostics.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db

from .health import MissionHealthComputer
from .launcher import MissionLauncher
from .lifecycle import MissionLifecycleService
from .schemas import (
    MissionCreate,
    MissionDiagnosticsResponse,
    MissionHealthResponse,
    MissionLaunchRequest,
    MissionLaunchResponse,
    MissionListResponse,
    MissionResponse,
    MissionTemplateCloneRequest,
    MissionUpdate,
)
from .service import MissionService

router = APIRouter()


def get_mission_service(db=Depends(get_db)) -> MissionService:
    """Dependency to get mission service."""
    return MissionService(db)


def get_mission_launcher(db=Depends(get_db)) -> MissionLauncher:
    """Dependency to get mission launcher."""
    return MissionLauncher(db)


def get_lifecycle_service(db=Depends(get_db)) -> MissionLifecycleService:
    """Dependency to get lifecycle service."""
    return MissionLifecycleService(db)


def get_health_computer(db=Depends(get_db)) -> MissionHealthComputer:
    """Dependency to get health computer."""
    return MissionHealthComputer(db)


# ---------- Template / Catalog ----------


@router.get("/templates", response_model=MissionListResponse)
async def list_mission_templates(
    skip: int = 0,
    limit: int = 100,
    is_featured: Optional[bool] = None,
    tags: list[str] = Query(default=[]),
    service: MissionService = Depends(get_mission_service),
):
    """List curated mission templates available for cloning."""
    missions, total = await service.list_templates(
        skip=skip,
        limit=limit,
        is_featured=is_featured or None,
        tags=tags or None,
    )
    return {"missions": missions, "total": total}


@router.get("/templates/{mission_id}", response_model=MissionResponse)
async def get_mission_template(
    mission_id: UUID,
    service: MissionService = Depends(get_mission_service),
):
    """Get a single mission template by ID."""
    template = await service.get_template(mission_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission template not found",
        )
    return template


@router.post("/templates/{mission_id}/clone", response_model=MissionResponse, status_code=status.HTTP_201_CREATED)
async def clone_mission_template(
    mission_id: UUID,
    body: MissionTemplateCloneRequest,
    service: MissionService = Depends(get_mission_service),
):
    """Clone a mission template into a workspace-local mission."""
    cloned = await service.clone_template(mission_id, body.model_dump(exclude_unset=True))
    if not cloned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission template not found or cannot be cloned",
        )
    return cloned


# ---------- CRUD ----------


@router.get("", response_model=MissionListResponse)
async def list_missions(
    skip: int = 0,
    limit: int = 100,
    workspace_id: Optional[UUID] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    is_system: Optional[bool] = None,
    is_template: Optional[bool] = None,
    is_featured: Optional[bool] = None,
    tags: list[str] = Query(default=[]),
    service: MissionService = Depends(get_mission_service),
):
    """List all missions with optional workspace and status filters."""
    missions, total = await service.list_missions(
        skip=skip,
        limit=limit,
        workspace_id=workspace_id,
        status=status_filter,
        is_system=is_system,
        is_template=is_template,
        is_featured=is_featured,
        tags=tags or None,
    )
    return {"missions": missions, "total": total}


@router.get("/{mission_id}", response_model=MissionResponse)
async def get_mission(
    mission_id: UUID,
    service: MissionService = Depends(get_mission_service),
):
    """Get a mission by ID."""
    mission = await service.get_mission(mission_id)
    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission not found",
        )
    return mission


@router.post("", response_model=MissionResponse, status_code=status.HTTP_201_CREATED)
async def create_mission(
    mission_data: MissionCreate,
    service: MissionService = Depends(get_mission_service),
):
    """Create a new mission."""
    mission = await service.create_mission(mission_data.model_dump())
    return mission


@router.patch("/{mission_id}", response_model=MissionResponse)
async def update_mission(
    mission_id: UUID,
    mission_data: MissionUpdate,
    service: MissionService = Depends(get_mission_service),
):
    """Update a mission."""
    mission = await service.update_mission(
        mission_id,
        mission_data.model_dump(exclude_unset=True),
    )
    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission not found",
        )
    return mission


@router.delete("/{mission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mission(
    mission_id: UUID,
    service: MissionService = Depends(get_mission_service),
):
    """Delete a mission."""
    success = await service.delete_mission(mission_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission not found",
        )
    return None


# ---------- Launch ----------


@router.post("/{mission_id}/launch", response_model=MissionLaunchResponse)
async def launch_mission(
    mission_id: UUID,
    workspace_id: UUID = Query(...),
    body: Optional[MissionLaunchRequest] = None,
    launcher: MissionLauncher = Depends(get_mission_launcher),
):
    """Launch a mission manually, creating a new run."""
    try:
        result = await launcher.launch_mission(
            mission_id=mission_id,
            workspace_id=workspace_id,
            parameters=body.parameters if body else None,
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


# ---------- Lifecycle ----------


@router.post("/{mission_id}/pause", response_model=dict)
async def pause_mission(
    mission_id: UUID,
    lifecycle: MissionLifecycleService = Depends(get_lifecycle_service),
):
    """Pause a mission and disable its triggers."""
    try:
        return await lifecycle.pause_mission(mission_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.post("/{mission_id}/resume", response_model=dict)
async def resume_mission(
    mission_id: UUID,
    lifecycle: MissionLifecycleService = Depends(get_lifecycle_service),
):
    """Resume a paused mission and re-enable triggers."""
    try:
        return await lifecycle.resume_mission(mission_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.post("/{mission_id}/disable", response_model=dict)
async def disable_mission(
    mission_id: UUID,
    reason: Optional[str] = Query(default=None),
    lifecycle: MissionLifecycleService = Depends(get_lifecycle_service),
):
    """Disable a mission and all associated triggers."""
    try:
        return await lifecycle.disable_mission(mission_id, reason=reason)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.post("/{mission_id}/activate", response_model=dict)
async def activate_mission(
    mission_id: UUID,
    lifecycle: MissionLifecycleService = Depends(get_lifecycle_service),
):
    """Activate a mission from draft status."""
    try:
        return await lifecycle.activate_mission(mission_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


# ---------- Health & Diagnostics ----------


@router.get("/{mission_id}/health", response_model=MissionHealthResponse)
async def get_mission_health(
    mission_id: UUID,
    computer: MissionHealthComputer = Depends(get_health_computer),
):
    """Get mission health summary."""
    try:
        return await computer.compute_health(mission_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )


@router.get("/{mission_id}/diagnostics", response_model=MissionDiagnosticsResponse)
async def get_mission_diagnostics(
    mission_id: UUID,
    computer: MissionHealthComputer = Depends(get_health_computer),
):
    """Get mission diagnostics including budget, trigger, and error information."""
    try:
        summary = await computer.get_health_summary(mission_id)
        return MissionDiagnosticsResponse(
            mission_id=summary["mission_id"],
            budget_policy_id=summary.get("budget_policy_id"),
            runs_today=summary.get("runs_today", 0),
            max_runs_per_day=summary.get("max_runs_per_day"),
            concurrent_runs=summary.get("concurrent_runs", 0),
            max_concurrent_runs=summary.get("max_concurrent_runs"),
            budget_exhausted=summary.get("budget_exhausted", False),
            cooldown_active=summary.get("cooldown_active", False),
            cooldown_remaining_seconds=summary.get("cooldown_remaining_seconds"),
            trigger_count=summary.get("trigger_count", 0),
            enabled_trigger_count=summary.get("enabled_trigger_count", 0),
            last_triggered_at=summary.get("last_triggered_at"),
            recent_error_count=summary.get("recent_error_count", 0),
            last_error_summary=summary.get("last_error_summary"),
            repeated_errors=summary.get("repeated_errors", []),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )


# ---------- Runs & Artifacts ----------


@router.get("/{mission_id}/runs")
async def get_mission_runs(
    mission_id: UUID,
    skip: int = 0,
    limit: int = 50,
    service: MissionService = Depends(get_mission_service),
):
    """Get run history for a mission."""
    # Verify mission exists
    mission = await service.get_mission(mission_id)
    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission not found",
        )
    runs, total = await service.get_mission_runs(mission_id, skip=skip, limit=limit)
    return {"runs": runs, "total": total}


@router.get("/{mission_id}/artifacts")
async def get_mission_artifacts(
    mission_id: UUID,
    skip: int = 0,
    limit: int = 50,
    service: MissionService = Depends(get_mission_service),
):
    """Get artifacts produced by a mission."""
    mission = await service.get_mission(mission_id)
    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mission not found",
        )
    artifacts, total = await service.get_mission_artifacts(
        mission_id, skip=skip, limit=limit
    )
    return {"artifacts": artifacts, "total": total}
