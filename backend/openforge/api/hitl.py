"""
HITL (Human-in-the-Loop) approval API.

Agents pause when they need to execute a high-risk tool and create a HITL
request.  Users approve or deny via these endpoints, which unblocks the
waiting agent coroutine.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.db.models import HITLRequest
from openforge.services.hitl_service import hitl_service

router = APIRouter()


# ── Output schema ─────────────────────────────────────────────────────────────


class HITLRequestOut(BaseModel):
    id: str
    workspace_id: str
    conversation_id: str
    tool_id: str
    tool_input: dict
    action_summary: str
    risk_level: str
    agent_id: Optional[str] = None
    status: str
    resolution_note: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None

    @classmethod
    def from_orm(cls, req: HITLRequest) -> "HITLRequestOut":
        return cls(
            id=str(req.id),
            workspace_id=str(req.workspace_id),
            conversation_id=str(req.conversation_id),
            tool_id=req.tool_id,
            tool_input=req.tool_input or {},
            action_summary=req.action_summary,
            risk_level=req.risk_level,
            agent_id=req.agent_id,
            status=req.status,
            resolution_note=req.resolution_note,
            created_at=req.created_at.isoformat(),
            resolved_at=req.resolved_at.isoformat() if req.resolved_at else None,
        )


class HITLResolution(BaseModel):
    resolution_note: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/pending", response_model=list[HITLRequestOut])
async def list_pending(
    workspace_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all pending HITL requests, optionally filtered by workspace."""
    ws_id = UUID(workspace_id) if workspace_id else None
    requests = await hitl_service.list_pending(db, workspace_id=ws_id)
    return [HITLRequestOut.from_orm(r) for r in requests]


@router.get("/pending/count")
async def count_pending(
    workspace_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Return the count of pending HITL requests (powers the FAB badge)."""
    ws_id = UUID(workspace_id) if workspace_id else None
    count = await hitl_service.count_pending(db, workspace_id=ws_id)
    return {"pending": count}


@router.get("/history", response_model=list[HITLRequestOut])
async def list_history(
    workspace_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Paginated audit log of resolved HITL requests."""
    ws_id = UUID(workspace_id) if workspace_id else None
    requests = await hitl_service.list_history(db, workspace_id=ws_id, limit=limit, offset=offset)
    return [HITLRequestOut.from_orm(r) for r in requests]


@router.get("/{hitl_id}", response_model=HITLRequestOut)
async def get_request(hitl_id: UUID, db: AsyncSession = Depends(get_db)):
    req = await db.get(HITLRequest, hitl_id)
    if not req:
        raise HTTPException(status_code=404, detail="HITL request not found")
    return HITLRequestOut.from_orm(req)


@router.post("/{hitl_id}/approve", response_model=HITLRequestOut)
async def approve_request(
    hitl_id: UUID,
    body: HITLResolution,
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending HITL request, resuming the paused agent."""
    req = await hitl_service.approve(db, hitl_id, note=body.resolution_note)
    if not req:
        raise HTTPException(status_code=404, detail="HITL request not found or already resolved")

    from openforge.api.websocket import ws_manager
    await ws_manager.send_to_workspace(str(req.workspace_id), {
        "type": "hitl_resolved",
        "data": {
            "id": str(req.id),
            "conversation_id": str(req.conversation_id),
            "status": "approved",
        },
    })
    return HITLRequestOut.from_orm(req)


@router.post("/{hitl_id}/deny", response_model=HITLRequestOut)
async def deny_request(
    hitl_id: UUID,
    body: HITLResolution,
    db: AsyncSession = Depends(get_db),
):
    """Deny a pending HITL request, causing the agent to skip the tool."""
    req = await hitl_service.deny(db, hitl_id, note=body.resolution_note)
    if not req:
        raise HTTPException(status_code=404, detail="HITL request not found or already resolved")

    from openforge.api.websocket import ws_manager
    await ws_manager.send_to_workspace(str(req.workspace_id), {
        "type": "hitl_resolved",
        "data": {
            "id": str(req.id),
            "conversation_id": str(req.conversation_id),
            "status": "denied",
        },
    })
    return HITLRequestOut.from_orm(req)
