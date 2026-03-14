"""
Mission domain API router.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import MissionCreate, MissionListResponse, MissionResponse, MissionUpdate
from .service import MissionService

router = APIRouter()


def get_mission_service(db=Depends(get_db)) -> MissionService:
    """Dependency to get mission service."""
    return MissionService(db)


@router.get("/", response_model=MissionListResponse)
async def list_missions(
    skip: int = 0,
    limit: int = 100,
    service: MissionService = Depends(get_mission_service),
):
    """List all missions."""
    missions, total = await service.list_missions(skip=skip, limit=limit)
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


@router.post("/", response_model=MissionResponse, status_code=status.HTTP_201_CREATED)
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
    mission = await service.update_mission(mission_id, mission_data.model_dump(exclude_unset=True))
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
