"""Mission domain API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db

from .schemas import (
    MissionCreate,
    MissionCycleResponse,
    MissionListResponse,
    MissionResponse,
    MissionUpdate,
)
from .service import MissionService

mission_router = APIRouter()


@mission_router.get("", response_model=MissionListResponse)
async def list_missions(
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """List all missions, optionally filtered by status."""
    service = MissionService(db)
    missions, total = await service.list_missions(status=status, skip=skip, limit=limit)
    return {"missions": missions, "total": total}


@mission_router.post("", response_model=MissionResponse, status_code=201)
async def create_mission(
    body: MissionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new mission in draft status."""
    service = MissionService(db)
    try:
        return await service.create_mission(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mission_router.get("/{mission_id}", response_model=MissionResponse)
async def get_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    service = MissionService(db)
    mission = await service.get_mission(mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return mission


@mission_router.patch("/{mission_id}", response_model=MissionResponse)
async def update_mission(
    mission_id: UUID,
    body: MissionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a mission (draft or paused only)."""
    service = MissionService(db)
    try:
        return await service.update_mission(
            mission_id, body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mission_router.delete("/{mission_id}", status_code=204)
async def delete_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a draft mission."""
    service = MissionService(db)
    try:
        await service.delete_mission(mission_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mission_router.post("/{mission_id}/activate", response_model=MissionResponse)
async def activate_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Activate a draft or paused mission."""
    service = MissionService(db)
    try:
        return await service.activate(mission_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mission_router.post("/{mission_id}/pause", response_model=MissionResponse)
async def pause_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Pause an active mission."""
    service = MissionService(db)
    try:
        return await service.pause(mission_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mission_router.post("/{mission_id}/terminate", response_model=MissionResponse)
async def terminate_mission(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Terminate a mission."""
    service = MissionService(db)
    try:
        return await service.terminate(mission_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mission_router.get("/{mission_id}/cycles")
async def list_cycles(
    mission_id: UUID,
    status: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List cycles for a mission."""
    service = MissionService(db)
    try:
        cycles, total = await service.list_cycles(
            mission_id, status=status, skip=skip, limit=limit,
        )
        return {
            "cycles": [MissionCycleResponse.model_validate(c) for c in cycles],
            "total": total,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@mission_router.get("/{mission_id}/cycles/{cycle_id}", response_model=MissionCycleResponse)
async def get_cycle(
    mission_id: UUID,
    cycle_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific cycle."""
    service = MissionService(db)
    try:
        cycle = await service.get_cycle(mission_id, cycle_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return cycle


@mission_router.post("/{mission_id}/workspace/promote")
async def promote_workspace(
    mission_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Promote a mission workspace to a regular user workspace."""
    service = MissionService(db)
    try:
        return await service.promote_workspace(mission_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
