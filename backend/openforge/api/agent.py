"""
Agent invocation API.

Provides a synchronous endpoint for subagent execution — used by the
agent.invoke tool (in the tool server) to spawn a child agent, collect its
full response, and return it to the calling parent agent.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.db.models import Workspace

router = APIRouter()


class SubagentRequest(BaseModel):
    instruction: str
    workspace_id: str
    parent_execution_id: Optional[str] = None
    parent_conversation_id: Optional[str] = None
    parent_workspace_id: Optional[str] = None


class SubagentResponse(BaseModel):
    response: str
    timeline: list
    conversation_id: Optional[str] = None


@router.post("/invoke", response_model=SubagentResponse)
async def invoke_subagent(
    req: SubagentRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Invoke a subagent synchronously in the target workspace.

    The caller (usually the agent.invoke tool server tool) blocks until the
    subagent finishes and returns the full response plus timeline.  This is
    intentionally synchronous — the parent agent is already waiting for a tool
    result.
    """
    from openforge.services.agent_execution_engine import agent_engine

    try:
        workspace_id = UUID(req.workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace_id")

    ws = await db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace {req.workspace_id} not found")

    parent_conv_id: UUID | None = None
    parent_ws_id: UUID | None = None
    if req.parent_conversation_id:
        try:
            parent_conv_id = UUID(req.parent_conversation_id)
        except ValueError:
            pass
    if req.parent_workspace_id:
        try:
            parent_ws_id = UUID(req.parent_workspace_id)
        except ValueError:
            pass

    try:
        result = await agent_engine.execute_subagent(
            workspace_id=workspace_id,
            instruction=req.instruction,
            db=db,
            parent_execution_id=req.parent_execution_id,
            parent_conversation_id=parent_conv_id,
            parent_workspace_id=parent_ws_id,
        )
        return SubagentResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subagent execution failed: {e}")
