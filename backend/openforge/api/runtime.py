"""Runtime orchestration endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import Workspace
from openforge.db.postgres import get_db
from openforge.runtime.chat_handler import chat_handler

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
    call_id: Optional[str] = None
    # Root forwarding context for deep nesting (2+ levels)
    root_execution_id: Optional[str] = None
    root_conversation_id: Optional[str] = None
    root_workspace_id: Optional[str] = None
    call_id_path: Optional[list[str]] = None


class DelegationResponse(BaseModel):
    response: str
    timeline: list
    conversation_id: Optional[str] = None


class TransferRequest(BaseModel):
    target_agent_slug: str
    workspace_id: str
    conversation_id: str


class TransferResponse(BaseModel):
    transferred: bool
    target_agent: str


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
    root_conversation_id: UUID | None = None
    root_workspace_id: UUID | None = None
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
    if req.root_conversation_id:
        try:
            root_conversation_id = UUID(req.root_conversation_id)
        except ValueError:
            root_conversation_id = None
    if req.root_workspace_id:
        try:
            root_workspace_id = UUID(req.root_workspace_id)
        except ValueError:
            root_workspace_id = None

    try:
        result = await chat_handler.execute_subagent(
            workspace_id=workspace_id,
            instruction=req.instruction,
            db=db,
            agent_id=req.agent_id,
            parent_execution_id=req.parent_execution_id,
            parent_conversation_id=parent_conversation_id,
            parent_workspace_id=parent_workspace_id,
            scope_path=req.scope_path,
            execution_chain_id=req.execution_chain_id,
            call_id=req.call_id,
            root_execution_id=req.root_execution_id,
            root_conversation_id=root_conversation_id,
            root_workspace_id=root_workspace_id,
            call_id_path=req.call_id_path,
        )
        return DelegationResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Delegation execution failed: {exc}") from exc


@router.post("/delegations/transfer", response_model=TransferResponse)
async def transfer_delegation(req: TransferRequest, db: AsyncSession = Depends(get_db)):
    """Swarm-style transfer: switch the active agent for a conversation."""
    try:
        workspace_id = UUID(req.workspace_id)
        conversation_id = UUID(req.conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid UUID") from exc

    from openforge.runtime.handoff_engine import handoff_engine

    try:
        result = await handoff_engine.transfer_to(
            db=db,
            target_agent_slug=req.target_agent_slug,
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            messages=[],
        )
        return TransferResponse(
            transferred=result.get("transferred", False),
            target_agent=result.get("target_agent", req.target_agent_slug),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transfer failed: {exc}") from exc
