"""API endpoints for continuous targets."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.schemas.agent import ContinuousTargetResponse, TargetUpdateRequest
from openforge.services.target_service import target_service

router = APIRouter()


@router.get(
    "/{workspace_id}/targets",
    response_model=list[ContinuousTargetResponse],
)
async def list_targets(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    targets = await target_service.list_targets(db, workspace_id)
    return targets


@router.post(
    "/{workspace_id}/targets/{name}/update",
    response_model=ContinuousTargetResponse,
)
async def update_target(
    workspace_id: UUID,
    name: str,
    body: TargetUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.mode not in ("replace", "append", "patch"):
        raise HTTPException(400, "mode must be 'replace', 'append', or 'patch'")

    target = await target_service.update(
        db=db,
        workspace_id=workspace_id,
        name=name,
        content=body.content,
        mode=body.mode,
        agent_id=body.agent_id,
    )
    return target
