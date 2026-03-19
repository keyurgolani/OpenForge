"""Automation domain API router."""

import uuid as _uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db

from .schemas import (
    AutomationCompileResponse,
    AutomationCreate,
    AutomationListResponse,
    AutomationResponse,
    AutomationRunRequest,
    AutomationRunResponse,
    AutomationUpdate,
)
from .service import AutomationService

router = APIRouter()


def get_automation_service(db=Depends(get_db)) -> AutomationService:
    return AutomationService(db)


# ── Template endpoints ──


@router.get("/templates", response_model=AutomationListResponse)
async def list_automation_templates(
    skip: int = 0,
    limit: int = 100,
    service: AutomationService = Depends(get_automation_service),
):
    automations, total = await service.list_templates(skip=skip, limit=limit)
    return {"automations": automations, "total": total}


# ── Standard CRUD endpoints ──


@router.get("", response_model=AutomationListResponse)
async def list_automations(
    skip: int = 0,
    limit: int = 100,
    status_filter: str | None = Query(default=None, alias="status"),
    agent_id: UUID | None = None,
    service: AutomationService = Depends(get_automation_service),
):
    automations, total = await service.list_automations(
        skip=skip, limit=limit, status=status_filter, agent_id=agent_id
    )
    return {"automations": automations, "total": total}


@router.post("", response_model=AutomationResponse, status_code=status.HTTP_201_CREATED)
async def create_automation(
    data: AutomationCreate,
    service: AutomationService = Depends(get_automation_service),
):
    return await service.create_automation(data.model_dump())


@router.get("/{automation_id}", response_model=AutomationResponse)
async def get_automation(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    automation = await service.get_automation(automation_id)
    if not automation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return automation


@router.patch("/{automation_id}", response_model=AutomationResponse)
async def update_automation(
    automation_id: UUID,
    data: AutomationUpdate,
    service: AutomationService = Depends(get_automation_service),
):
    automation = await service.update_automation(automation_id, data.model_dump(exclude_unset=True))
    if not automation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return automation


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    success = await service.delete_automation(automation_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return None


# ── Compilation endpoints ──


@router.post("/{automation_id}/compile", response_model=AutomationCompileResponse)
async def compile_automation(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    result = await service.compile_automation(automation_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return result


# ── Lifecycle endpoints ──


@router.post("/{automation_id}/pause", response_model=AutomationResponse)
async def pause_automation(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    result = await service.set_status(automation_id, "paused")
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return result


@router.post("/{automation_id}/resume", response_model=AutomationResponse)
async def resume_automation(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    result = await service.set_status(automation_id, "active")
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return result


@router.post("/{automation_id}/activate", response_model=AutomationResponse)
async def activate_automation(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    result = await service.set_status(automation_id, "active")
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return result


@router.get("/{automation_id}/health")
async def get_health(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    health = await service.get_health(automation_id)
    if not health:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return health


@router.get("/{automation_id}/spec")
async def get_active_spec(
    automation_id: UUID,
    service: AutomationService = Depends(get_automation_service),
):
    spec = await service.get_active_spec(automation_id)
    if not spec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active spec found")
    return spec


# ── Run trigger endpoint ──


@router.post("/{automation_id}/run", response_model=AutomationRunResponse)
async def run_automation(
    automation_id: UUID,
    req: AutomationRunRequest,
    db: AsyncSession = Depends(get_db),
    service: AutomationService = Depends(get_automation_service),
):
    """Trigger an automation run.

    Creates a RunModel and queues a Celery task to execute
    the agent strategy in the background.
    """
    from openforge.db.models import AutomationModel, CompiledAutomationSpecModel, RunModel

    automation = await service.get_automation(automation_id)
    if not automation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")

    if automation.status not in ("active", "draft"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Automation is {automation.status}, cannot run")

    if automation.active_spec_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Automation has no compiled spec")

    run_id = _uuid.uuid4()
    run = RunModel(
        id=run_id,
        run_type="automation",
        workspace_id=req.workspace_id,
        status="pending",
        input_payload=req.input_payload,
        composite_metadata={
            "automation_id": str(automation.id),
            "agent_id": str(automation.agent_id),
        },
    )
    db.add(run)
    await db.commit()

    # Queue Celery task
    try:
        from openforge.worker.tasks import execute_agent_strategy
        execute_agent_strategy.delay(run_id=str(run_id))
    except Exception:
        # If Celery is unavailable, the run stays pending
        pass

    return AutomationRunResponse(
        run_id=run_id,
        automation_id=automation.id,
        status="pending",
    )
