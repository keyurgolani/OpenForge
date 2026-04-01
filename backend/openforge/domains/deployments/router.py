"""Deployment domain API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db

from .schemas import DeploymentCreate, DeploymentListResponse, DeploymentResponse
from .service import DeploymentService

deploy_router = APIRouter()


@deploy_router.post("", response_model=DeploymentResponse, status_code=201)
async def deploy_automation(
    automation_id: UUID,
    body: DeploymentCreate,
    db: AsyncSession = Depends(get_db),
):
    """Deploy an automation with baked-in input values."""
    service = DeploymentService(db)
    try:
        return await service.deploy(
            automation_id=automation_id,
            workspace_id=body.workspace_id,
            input_values=body.input_values,
            schedule_expression=body.schedule_expression,
            interval_seconds=body.interval_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


listing_router = APIRouter()


@listing_router.get("", response_model=DeploymentListResponse)
async def list_deployments(
    status: str | None = None,
    automation_id: UUID | None = None,
    workspace_id: UUID | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    service = DeploymentService(db)
    deployments, total = await service.list_deployments(
        skip=skip, limit=limit, status=status,
        automation_id=automation_id, workspace_id=workspace_id,
    )
    return {"deployments": deployments, "total": total}


@listing_router.get("/{deployment_id}", response_model=DeploymentResponse)
async def get_deployment(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    service = DeploymentService(db)
    result = await service.get_deployment(deployment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return result


@listing_router.post("/{deployment_id}/pause", response_model=DeploymentResponse)
async def pause_deployment(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    service = DeploymentService(db)
    try:
        return await service.pause(deployment_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@listing_router.post("/{deployment_id}/resume", response_model=DeploymentResponse)
async def resume_deployment(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    service = DeploymentService(db)
    try:
        return await service.resume(deployment_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@listing_router.post("/{deployment_id}/teardown", response_model=DeploymentResponse)
async def teardown_deployment(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    service = DeploymentService(db)
    try:
        return await service.teardown(deployment_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@listing_router.post("/{deployment_id}/run-now")
async def run_now(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    """Trigger an immediate run of this deployment."""
    service = DeploymentService(db)
    try:
        return await service.run_now(deployment_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
