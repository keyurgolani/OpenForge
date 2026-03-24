"""HITL (Human-in-the-Loop) approval REST endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.runtime.hitl import hitl_service

router = APIRouter()


class ResolveRequest(BaseModel):
    approved: bool
    resolution_note: Optional[str] = None


class ApprovalResponse(BaseModel):
    id: UUID
    status: str
    requested_action: str
    tool_name: Optional[str]
    risk_category: str
    resolution_note: Optional[str]
    requested_at: str
    resolved_at: Optional[str]

    model_config = {"from_attributes": True}


@router.post("/approvals/{hitl_id}/resolve", response_model=ApprovalResponse)
async def resolve_approval(
    hitl_id: UUID,
    body: ResolveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Approve or deny a pending HITL approval request."""
    if body.approved:
        req = await hitl_service.approve(db, hitl_id, body.resolution_note)
    else:
        req = await hitl_service.deny(db, hitl_id, body.resolution_note)

    if req is None:
        raise HTTPException(
            status_code=404,
            detail=f"Approval request {hitl_id} not found or already resolved",
        )

    return ApprovalResponse(
        id=req.id,
        status=req.status,
        requested_action=req.requested_action,
        tool_name=req.tool_name,
        risk_category=req.risk_category,
        resolution_note=req.resolution_note,
        requested_at=req.requested_at.isoformat(),
        resolved_at=req.resolved_at.isoformat() if req.resolved_at else None,
    )
