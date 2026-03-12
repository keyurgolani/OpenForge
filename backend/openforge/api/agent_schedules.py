"""API endpoints for scheduled agent triggers."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.agent_registry import agent_registry
from openforge.db.models import AgentSchedule
from openforge.db.postgres import get_db
from openforge.schemas.agent import (
    AgentScheduleCreate,
    AgentScheduleResponse,
    AgentScheduleUpdate,
)

router = APIRouter()


def _compute_next_run(cron_expression: str) -> datetime:
    """Compute the next run time from a cron expression."""
    now = datetime.now(timezone.utc)
    cron = croniter(cron_expression, now)
    return cron.get_next(datetime).replace(tzinfo=timezone.utc)


@router.get(
    "/{workspace_id}/agent-schedules",
    response_model=list[AgentScheduleResponse],
)
async def list_schedules(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSchedule)
        .where(AgentSchedule.workspace_id == workspace_id)
        .order_by(AgentSchedule.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/{workspace_id}/agent-schedules",
    response_model=AgentScheduleResponse,
)
async def create_schedule(
    workspace_id: UUID,
    body: AgentScheduleCreate,
    db: AsyncSession = Depends(get_db),
):
    # Verify agent exists
    if not agent_registry.get(body.agent_id):
        raise HTTPException(404, "Agent not found")

    # Validate cron expression
    if not croniter.is_valid(body.cron_expression):
        raise HTTPException(400, "Invalid cron expression")

    next_run = _compute_next_run(body.cron_expression) if body.is_enabled else None

    schedule = AgentSchedule(
        workspace_id=workspace_id,
        agent_id=body.agent_id,
        name=body.name,
        instruction=body.instruction,
        cron_expression=body.cron_expression,
        is_enabled=body.is_enabled,
        next_run_at=next_run,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.put(
    "/{workspace_id}/agent-schedules/{schedule_id}",
    response_model=AgentScheduleResponse,
)
async def update_schedule(
    workspace_id: UUID,
    schedule_id: UUID,
    body: AgentScheduleUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSchedule).where(
            AgentSchedule.id == schedule_id,
            AgentSchedule.workspace_id == workspace_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(404, "Schedule not found")

    if body.name is not None:
        schedule.name = body.name
    if body.instruction is not None:
        schedule.instruction = body.instruction
    if body.cron_expression is not None:
        if not croniter.is_valid(body.cron_expression):
            raise HTTPException(400, "Invalid cron expression")
        schedule.cron_expression = body.cron_expression
    if body.is_enabled is not None:
        schedule.is_enabled = body.is_enabled

    # Recompute next_run if schedule is enabled
    if schedule.is_enabled:
        schedule.next_run_at = _compute_next_run(schedule.cron_expression)
    else:
        schedule.next_run_at = None

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{workspace_id}/agent-schedules/{schedule_id}")
async def delete_schedule(
    workspace_id: UUID,
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSchedule).where(
            AgentSchedule.id == schedule_id,
            AgentSchedule.workspace_id == workspace_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(404, "Schedule not found")

    await db.delete(schedule)
    await db.commit()
    return {"status": "deleted"}
