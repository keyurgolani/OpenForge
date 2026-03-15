"""Runtime orchestration endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import Workspace
from openforge.db.postgres import get_db
from openforge.runtime.execution_engine import agent_engine

router = APIRouter()


class DelegationRequest(BaseModel):
    instruction: str
    workspace_id: str
    agent_id: Optional[str] = None
    parent_execution_id: Optional[str] = None
    parent_conversation_id: Optional[str] = None
    parent_workspace_id: Optional[str] = None
    execution_chain_id: Optional[str] = None
    scope_path: Optional[list[int]] = None


class DelegationResponse(BaseModel):
    response: str
    timeline: list
    conversation_id: Optional[str] = None


@router.post("/delegations/invoke", response_model=DelegationResponse)
async def invoke_delegation(req: DelegationRequest, db: AsyncSession = Depends(get_db)):
    try:
        workspace_id = UUID(req.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid workspace_id") from exc

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail=f"Workspace {req.workspace_id} not found")

    parent_conversation_id: UUID | None = None
    parent_workspace_id: UUID | None = None
    if req.parent_conversation_id:
        try:
            parent_conversation_id = UUID(req.parent_conversation_id)
        except ValueError:
            parent_conversation_id = None
    if req.parent_workspace_id:
        try:
            parent_workspace_id = UUID(req.parent_workspace_id)
        except ValueError:
            parent_workspace_id = None

    try:
        result = await agent_engine.execute_subagent(
            workspace_id=workspace_id,
            instruction=req.instruction,
            db=db,
            agent_id=req.agent_id,
            parent_execution_id=req.parent_execution_id,
            parent_conversation_id=parent_conversation_id,
            parent_workspace_id=parent_workspace_id,
            scope_path=req.scope_path,
            execution_chain_id=req.execution_chain_id,
        )
        return DelegationResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Delegation execution failed: {exc}") from exc
