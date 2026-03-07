"""
HITL (Human-in-the-Loop) API endpoints.

Provides endpoints for managing tool approval requests.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional

from openforge.db.database import get_db
from openforge.services.hitl_service import hitl_service
from openforge.schemas.hitl import (
    HITLRequestResponse,
    HITLResolveRequest,
    HITLAuditEntry,
    HITLListParams,
)

router = APIRouter(prefix="/hitl", tags=["hitl"])


@router.get("/pending")
async def list_pending_requests(
    workspace_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all pending HITL requests."""
    requests = await hitl_service.get_pending(db, workspace_id=workspace_id)
    return {"requests": requests, "count": len(requests)}


@router.get("/pending/count")
async def get_pending_count(
    db: AsyncSession = Depends(get_db),
):
    """Get count of pending HITL requests."""
    count = await hitl_service.get_pending_count(db)
    return {"count": count}


@router.get("/{request_id}")
async def get_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific HITL request."""
    from openforge.db.models import HITLRequest

    from sqlalchemy import select

    result = await db.execute(
        select(HITLRequest).where(HITLRequest.id == request_id)
    )
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(404, "HITL request not found")

    item = hitl_service._request_to_dict(request)
    item["tool_display_name"] = await hitl_service._get_tool_display_name(request.tool_id)

    return item


@router.post("/{request_id}/approve")
async def approve_request(
    request_id: UUID,
    body: Optional[HITLResolveRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Approve an HITL request and resume the agent."""
    try:
        note = body.resolution_note if body else None
        request = await hitl_service.approve(db, request_id, resolution_note=note)

        if not request:
            raise HTTPException(404, "HITL request not found")

        return {
            "status": "approved",
            "request_id": str(request_id),
            "message": "Request approved, agent resuming",
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{request_id}/deny")
async def deny_request(
    request_id: UUID,
    body: Optional[HITLResolveRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Deny an HITL request and resume the agent."""
    try:
        note = body.resolution_note if body else None
        request = await hitl_service.deny(db, request_id, resolution_note=note)

        if not request:
            raise HTTPException(404, "HITL request not found")

        return {
            "status": "denied",
            "request_id": str(request_id),
            "message": "Request denied, agent resuming",
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/history")
async def get_history(
    page: int = 1,
    page_size: int = 20,
    workspace_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get paginated HITL history with audit logs."""
    if status and status not in ["pending", "approved", "denied"]:
        raise HTTPException(400, "Invalid status filter")

    requests, total = await hitl_service.get_history(
        db,
        page=page,
        page_size=page_size,
        workspace_id=workspace_id,
        status=status,
    )

    return {
        "requests": requests,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }
