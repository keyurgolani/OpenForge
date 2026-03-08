"""Agent management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from openforge.db.postgres import get_db
from openforge.core.agent_registry import agent_registry

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("")
async def list_agents():
    """List all registered agents."""
    agents = agent_registry.list_all()
    return {"agents": [
        {
            "agent_id": a.agent_id,
            "name": a.name,
            "description": a.description,
            "is_default": a.is_default,
            "is_system": a.is_system,
            "tools_enabled": a.tools_enabled,
            "rag_enabled": a.rag_enabled,
        }
        for a in agents
    ]}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get a specific agent definition."""
    agent = agent_registry.get(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return {
        "agent_id": agent.agent_id,
        "name": agent.name,
        "description": agent.description,
        "system_prompt": agent.system_prompt,
        "tools_enabled": agent.tools_enabled,
        "rag_enabled": agent.rag_enabled,
        "rag_limit": agent.rag_limit,
        "rag_score_threshold": agent.rag_score_threshold,
        "history_limit": agent.history_limit,
        "max_iterations": agent.max_iterations,
        "allowed_tool_categories": agent.allowed_tool_categories,
        "skill_hints": agent.skill_hints,
        "is_default": agent.is_default,
        "is_system": agent.is_system,
    }


@router.get("/workspaces/{workspace_id}/agent")
async def get_workspace_agent(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get the active agent for a workspace."""
    agent = await agent_registry.get_for_workspace(db, workspace_id)
    return {"agent_id": agent.agent_id, "name": agent.name}


@router.put("/workspaces/{workspace_id}/agent")
async def set_workspace_agent(workspace_id: UUID, body: dict, db: AsyncSession = Depends(get_db)):
    """Set the active agent for a workspace."""
    from sqlalchemy import select
    from openforge.db.models import Workspace

    agent_id = body.get("agent_id")
    if not agent_id:
        raise HTTPException(400, "agent_id is required")

    agent = agent_registry.get(agent_id)
    if not agent:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(404, "Workspace not found")

    if hasattr(workspace, 'agent_id'):
        workspace.agent_id = agent_id
        await db.commit()
    return {"agent_id": agent_id, "message": "Agent updated"}
