"""
Trigger domain API router.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db
from openforge.domains.common.enums import TriggerType
from openforge.domains.triggers.types import TriggerStatus, TriggerTargetType

from .schemas import (
    TriggerCreate,
    TriggerDiagnosticsResponse,
    TriggerFireRecord,
    TriggerListResponse,
    TriggerResponse,
    TriggerUpdate,
)
from .service import TriggerService

router = APIRouter()


def get_trigger_service(db=Depends(get_db)) -> TriggerService:
    """Dependency to get trigger service."""
    return TriggerService(db)


@router.get("/", response_model=TriggerListResponse)
async def list_triggers(
    skip: int = 0,
    limit: int = 100,
    workspace_id: Optional[UUID] = Query(default=None),
    target_type: Optional[TriggerTargetType] = Query(default=None),
    target_id: Optional[UUID] = Query(default=None),
    trigger_type: Optional[TriggerType] = Query(default=None),
    is_enabled: Optional[bool] = Query(default=None),
    service: TriggerService = Depends(get_trigger_service),
):
    """List triggers with optional filters."""
    triggers, total = await service.list_triggers(
        skip=skip,
        limit=limit,
        workspace_id=workspace_id,
        target_type=target_type.value if target_type else None,
        target_id=target_id,
        trigger_type=trigger_type.value if trigger_type else None,
        is_enabled=is_enabled,
    )
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
    data = trigger_data.model_dump()

    # Compute next_fire_at for scheduled trigger types
    next_fire = service.compute_next_fire_at(
        trigger_type=data["trigger_type"],
        schedule_expression=data.get("schedule_expression"),
        interval_seconds=data.get("interval_seconds"),
    )
    if next_fire:
        data["next_fire_at"] = next_fire

    trigger = await service.create_trigger(data)
    return trigger


@router.patch("/{trigger_id}", response_model=TriggerResponse)
async def update_trigger(
    trigger_id: UUID,
    trigger_data: TriggerUpdate,
    service: TriggerService = Depends(get_trigger_service),
):
    """Update a trigger."""
    data = trigger_data.model_dump(exclude_unset=True)

    # If schedule-related fields changed, recompute next_fire_at
    if any(k in data for k in ("trigger_type", "schedule_expression", "interval_seconds")):
        existing = await service.get_trigger(trigger_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Trigger not found",
            )
        t_type = data.get("trigger_type", existing["trigger_type"])
        sched = data.get("schedule_expression", existing.get("schedule_expression"))
        interval = data.get("interval_seconds", existing.get("interval_seconds"))
        next_fire = service.compute_next_fire_at(
            trigger_type=t_type,
            schedule_expression=sched,
            interval_seconds=interval,
            last_fired_at=existing.get("last_fired_at"),
        )
        data["next_fire_at"] = next_fire

    trigger = await service.update_trigger(trigger_id, data)
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
    return None


@router.post("/{trigger_id}/enable", response_model=TriggerResponse)
async def enable_trigger(
    trigger_id: UUID,
    service: TriggerService = Depends(get_trigger_service),
):
    """Enable a trigger."""
    trigger = await service.enable_trigger(trigger_id)
    if not trigger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )
    return trigger


@router.post("/{trigger_id}/disable", response_model=TriggerResponse)
async def disable_trigger(
    trigger_id: UUID,
    service: TriggerService = Depends(get_trigger_service),
):
    """Disable a trigger."""
    trigger = await service.disable_trigger(trigger_id)
    if not trigger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )
    return trigger


@router.get("/{trigger_id}/fire-history", response_model=list[TriggerFireRecord])
async def get_trigger_fire_history(
    trigger_id: UUID,
    skip: int = 0,
    limit: int = 50,
    service: TriggerService = Depends(get_trigger_service),
):
    """Get fire history for a trigger."""
    # Verify trigger exists
    trigger = await service.get_trigger(trigger_id)
    if not trigger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )
    return await service.get_trigger_fire_history(trigger_id, skip=skip, limit=limit)


@router.get("/{trigger_id}/diagnostics", response_model=TriggerDiagnosticsResponse)
async def get_trigger_diagnostics(
    trigger_id: UUID,
    service: TriggerService = Depends(get_trigger_service),
):
    """Get diagnostics for a trigger: scheduler state, last launch result, blocked reasons."""
    trigger = await service.get_trigger(trigger_id)
    if not trigger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trigger not found",
        )

    # Get most recent fire record
    history = await service.get_trigger_fire_history(trigger_id, skip=0, limit=1)
    last_launch_status = None
    last_launch_error = None
    if history:
        last_launch_status = history[0].get("launch_status")
        last_launch_error = history[0].get("error_message")

    # Determine blocked reasons
    blocked_reasons: list[str] = []
    if not trigger["is_enabled"]:
        blocked_reasons.append("Trigger is disabled")
    if trigger["status"] != TriggerStatus.ACTIVE:
        blocked_reasons.append(f"Trigger status is '{trigger['status']}', not 'active'")
    t_type = trigger["trigger_type"]
    if t_type == TriggerType.CRON and not trigger.get("schedule_expression"):
        blocked_reasons.append("Cron trigger has no schedule_expression")
    if t_type in (TriggerType.INTERVAL, TriggerType.HEARTBEAT) and not trigger.get("interval_seconds"):
        blocked_reasons.append("Interval/heartbeat trigger has no interval_seconds")
    if t_type == TriggerType.EVENT and not trigger.get("event_type"):
        blocked_reasons.append("Event trigger has no event_type")

    return TriggerDiagnosticsResponse(
        trigger_id=trigger_id,
        is_enabled=trigger["is_enabled"],
        status=trigger["status"],
        trigger_type=trigger["trigger_type"],
        next_fire_at=trigger.get("next_fire_at"),
        last_fired_at=trigger.get("last_fired_at"),
        last_launch_status=last_launch_status,
        last_launch_error=last_launch_error,
        blocked_reasons=blocked_reasons,
    )
