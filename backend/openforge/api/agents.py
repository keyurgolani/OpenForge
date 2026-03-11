"""Agent framework API endpoints: definitions, executions, and workspace agent management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from openforge.db.postgres import get_db
from openforge.db.models import AgentDefinitionModel, AgentExecution, Workspace
from openforge.schemas.agent import (
    AgentDefinitionResponse,
    AgentDefinitionUpdate,
    AgentExecutionResponse,
    WorkspaceAgentUpdate,
)
from openforge.core.agent_registry import agent_registry

router = APIRouter()


# ── Agent Definitions ──


@router.get("/", response_model=list[AgentDefinitionResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentDefinitionModel).order_by(AgentDefinitionModel.name)
    )
    return list(result.scalars().all())


@router.get("/{agent_id}", response_model=AgentDefinitionResponse)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentDefinitionModel).where(AgentDefinitionModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentDefinitionResponse)
async def update_agent(
    agent_id: str,
    update: AgentDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentDefinitionModel).where(AgentDefinitionModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")

    if update.name is not None:
        agent.name = update.name
    if update.description is not None:
        agent.description = update.description
    if update.icon is not None:
        agent.icon = update.icon
    if update.config is not None:
        existing_config = dict(agent.config or {})
        existing_config.update(update.config)
        agent.config = existing_config

    await db.commit()
    await db.refresh(agent)

    # Reload into registry
    from openforge.core.agent_definition import AgentDefinition
    agent_registry._agents[agent_id] = AgentDefinition.from_db_row(agent)

    return agent


# ── Workspace Agent ──


@router.get(
    "/workspace/{workspace_id}/agent",
    response_model=AgentDefinitionResponse | None,
)
async def get_workspace_agent(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    ws = await db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    agent_id = ws.agent_id or "workspace_agent"
    result = await db.execute(
        select(AgentDefinitionModel).where(AgentDefinitionModel.id == agent_id)
    )
    return result.scalar_one_or_none()


@router.put("/workspace/{workspace_id}/agent")
async def set_workspace_agent(
    workspace_id: UUID,
    body: WorkspaceAgentUpdate,
    db: AsyncSession = Depends(get_db),
):
    ws = await db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")

    # Verify agent exists
    result = await db.execute(
        select(AgentDefinitionModel).where(AgentDefinitionModel.id == body.agent_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Agent not found")

    ws.agent_id = body.agent_id
    await db.commit()
    return {"status": "ok", "agent_id": body.agent_id}


# ── Executions ──


@router.get(
    "/workspace/{workspace_id}/executions",
    response_model=list[AgentExecutionResponse],
)
async def list_executions(
    workspace_id: UUID,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(AgentExecution)
        .where(AgentExecution.workspace_id == workspace_id)
        .order_by(AgentExecution.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(AgentExecution.status == status)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get(
    "/workspace/{workspace_id}/executions/{execution_id}",
    response_model=AgentExecutionResponse,
)
async def get_execution(
    workspace_id: UUID,
    execution_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentExecution).where(
            AgentExecution.id == execution_id,
            AgentExecution.workspace_id == workspace_id,
        )
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(404, "Execution not found")
    return execution
