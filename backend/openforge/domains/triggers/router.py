"""
Trigger domain API router.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.openforge.db.session import get_db

from .schemas import TriggerCreate, TriggerResponse, TriggerUpdate
from .service import TriggerService

router = APIRouter()


def get_trigger_service(db: AsyncSession = Depends(get_db)) -> TriggerService:
    """Dependency to get trigger service."""
    return TriggerService(db)


@router.get("/", response_model=dict)
async def list_triggers(
    skip: int = 0,
    limit: int = 100,
    service: TriggerService = Depends(get_trigger_service),
):
    """List all triggers."""
    triggers, total = await service.list_triggers(skip=skip, limit=limit)
    return {"triggers": triggers, "total": total}


@router.get("/{trigger_id}", response_model=TriggerResponse)
async def get_trigger(
    trigger_id: UUID,
    service: TriggerService = Depends(get_trigger_service),
):
    """Get a trigger by ID."""
    trigger = await service.get_trigger(trigger_id)
    if not trigger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )
    return trigger


@router.post("/", response_model=TriggerResponse, status_code=status.HTTP_201_CREATED)
async def create_trigger(
    trigger_data: TriggerCreate,
    service: TriggerService = Depends(get_trigger_service),
):
    """Create a new trigger."""
    trigger = await service.create_trigger(trigger_data.model_dump())
    return trigger


@router.patch("/{trigger_id}", response_model=TriggerResponse)
async def update_trigger(
    trigger_id: UUID,
    trigger_data: TriggerUpdate,
    service: TriggerService = Depends(get_trigger_service),
):
    """Update a trigger."""
    trigger = await service.update_trigger(trigger_id, trigger_data.model_dump(exclude_unset=True))
    if not trigger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )
    return trigger


@router.delete("/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trigger(
    trigger_id: UUID,
    service: TriggerService = Depends(get_trigger_service),
):
    """Delete a trigger."""
    success = await service.delete_trigger(trigger_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )
