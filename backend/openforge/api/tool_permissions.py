"""Tool permissions API: per-tool allow/block/HITL overrides."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from openforge.db.postgres import get_db
from openforge.db.models import ToolPermission
from openforge.schemas.agent import ToolPermissionResponse, ToolPermissionUpdate

router = APIRouter()

VALID_PERMISSIONS = {"allowed", "hitl", "blocked", "default"}


@router.get("/permissions", response_model=list[ToolPermissionResponse])
async def list_tool_permissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ToolPermission).order_by(ToolPermission.tool_id)
    )
    return list(result.scalars().all())


@router.get("/{tool_id:path}/permission", response_model=ToolPermissionResponse | None)
async def get_tool_permission(tool_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ToolPermission).where(ToolPermission.tool_id == tool_id)
    )
    return result.scalar_one_or_none()


@router.put("/{tool_id:path}/permission", response_model=ToolPermissionResponse)
async def set_tool_permission(
    tool_id: str,
    body: ToolPermissionUpdate,
    db: AsyncSession = Depends(get_db),
):
    if body.permission not in VALID_PERMISSIONS:
        raise HTTPException(400, f"Invalid permission. Must be one of: {VALID_PERMISSIONS}")

    result = await db.execute(
        select(ToolPermission).where(ToolPermission.tool_id == tool_id)
    )
    perm = result.scalar_one_or_none()

    if body.permission == "default" and perm:
        # Remove the override — revert to risk-level default
        await db.delete(perm)
        await db.commit()
        # Return a default response
        return ToolPermissionResponse(
            id=perm.id, tool_id=tool_id, permission="default", updated_at=perm.updated_at
        )

    if perm:
        perm.permission = body.permission
    else:
        perm = ToolPermission(tool_id=tool_id, permission=body.permission)
        db.add(perm)

    await db.commit()
    await db.refresh(perm)
    return perm
