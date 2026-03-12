"""Agent framework API endpoints: definitions, executions, memory, and workspace agent management."""

from __future__ import annotations

import uuid as _uuid_mod
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from openforge.db.postgres import get_db
from openforge.db.models import AgentDefinitionModel, AgentExecution, Conversation, Workspace
from openforge.schemas.agent import (
    AgentDefinitionResponse,
    AgentDefinitionUpdate,
    AgentExecutionResponse,
    AgentTriggerRequest,
    AgentMemoryStoreRequest,
    AgentMemoryRecallRequest,
    AgentMemoryForgetRequest,
    WorkspaceAgentUpdate,
)
from openforge.core.agent_registry import agent_registry

router = APIRouter()


# ── Helpers ──


async def _build_agent_name_map(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(AgentDefinitionModel))
    return {a.id: a.name for a in result.scalars().all()}


async def _build_workspace_name_map(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(Workspace))
    return {str(w.id): w.name for w in result.scalars().all()}


def _enrich_executions(
    executions: list[AgentExecution],
    agent_names: dict[str, str],
    workspace_names: dict[str, str],
) -> list[AgentExecutionResponse]:
    out: list[AgentExecutionResponse] = []
    for ex in executions:
        resp = AgentExecutionResponse.model_validate(ex)
        resp.agent_name = agent_names.get(ex.agent_id)
        resp.workspace_name = workspace_names.get(str(ex.workspace_id))
        out.append(resp)
    return out


# ── Agent Definitions ──


@router.get("/", response_model=list[AgentDefinitionResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentDefinitionModel).order_by(AgentDefinitionModel.name)
    )
    return list(result.scalars().all())


# Static paths must be registered before /{agent_id} to avoid conflicts
@router.get("/executions", response_model=list[AgentExecutionResponse])
async def list_all_executions(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List all agent executions globally (no workspace filter)."""
    q = (
        select(AgentExecution)
        .order_by(AgentExecution.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(AgentExecution.status == status)
    result = await db.execute(q)
    executions = list(result.scalars().all())
    agent_names = await _build_agent_name_map(db)
    ws_names = await _build_workspace_name_map(db)
    return _enrich_executions(executions, agent_names, ws_names)


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
    executions = list(result.scalars().all())
    agent_names = await _build_agent_name_map(db)
    ws_names = await _build_workspace_name_map(db)
    return _enrich_executions(executions, agent_names, ws_names)


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


@router.get("/workspace/{workspace_id}/conversations/{conversation_id}/stream-state")
async def get_conversation_stream_state(
    workspace_id: UUID,
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return live stream state for a conversation if an execution is active."""
    import json

    result = await db.execute(
        select(AgentExecution)
        .where(
            AgentExecution.conversation_id == conversation_id,
            AgentExecution.workspace_id == workspace_id,
            AgentExecution.status.in_(["running", "paused_hitl"]),
        )
        .order_by(AgentExecution.started_at.desc())
        .limit(1)
    )
    exec_record = result.scalar_one_or_none()
    if not exec_record:
        return {"active": False}

    # Try Redis stream state
    try:
        from openforge.db.redis_client import get_redis

        redis = await get_redis()
        state = await redis.hgetall(f"stream_state:{exec_record.id}")
        if state:
            return {
                "active": True,
                "execution_id": str(exec_record.id),
                "status": exec_record.status,
                "content": state.get("content", ""),
                "thinking": state.get("thinking", ""),
                "tool_calls": json.loads(state.get("tool_calls", "[]")),
                "sources": json.loads(state.get("sources", "[]")),
                "attachments_processed": json.loads(
                    state.get("attachments_processed", "[]")
                ),
                "timeline": json.loads(state.get("timeline", "[]")),
            }
    except Exception:
        pass

    # Execution is active but no Redis state available
    return {
        "active": True,
        "execution_id": str(exec_record.id),
        "status": exec_record.status,
    }


# ── Agent Trigger ──


@router.post("/{agent_id}/trigger")
async def trigger_agent(
    agent_id: str,
    body: AgentTriggerRequest,
    db: AsyncSession = Depends(get_db),
):
    """Trigger an agent execution with a given instruction."""
    # Verify agent exists
    agent_def = agent_registry.get(agent_id)
    if not agent_def:
        raise HTTPException(404, "Agent not found")

    # Verify workspace exists
    ws = await db.get(Workspace, body.workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")

    # Create conversation for this triggered run
    conv = Conversation(
        workspace_id=body.workspace_id,
        title=f"Triggered: {agent_def.name}",
        is_subagent=False,
    )
    db.add(conv)
    await db.flush()

    # Create execution record
    execution_id = _uuid_mod.uuid4()
    db.add(AgentExecution(
        id=execution_id,
        workspace_id=body.workspace_id,
        conversation_id=conv.id,
        agent_id=agent_id,
        status="queued",
    ))
    await db.commit()

    # Dispatch via Celery if available, otherwise run inline
    from openforge.config import get_settings
    settings = get_settings()

    if settings.use_celery_agents:
        try:
            from openforge.worker.tasks import execute_agent_task
            execute_agent_task.delay(
                execution_id=str(execution_id),
                workspace_id=str(body.workspace_id),
                conversation_id=str(conv.id),
                user_message=body.instruction,
                agent_id=agent_id,
                agent_enabled=agent_def.tools_enabled,
                agent_tool_categories=agent_def.allowed_tool_categories or [],
                agent_max_tool_loops=agent_def.max_iterations,
                attachment_ids=[],
                provider_id=None,
                model_id=None,
                mentions=[],
            )
        except Exception:
            # Fall back to inline
            import asyncio
            from openforge.db.postgres import AsyncSessionLocal
            from openforge.services.agent_execution_engine import agent_engine

            async def _run():
                async with AsyncSessionLocal() as run_db:
                    await agent_engine.run(
                        workspace_id=body.workspace_id,
                        conversation_id=conv.id,
                        user_content=body.instruction,
                        db=run_db,
                        agent=agent_def,
                        execution_id=str(execution_id),
                    )

            asyncio.create_task(_run())
    else:
        import asyncio
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.services.agent_execution_engine import agent_engine

        async def _run():
            async with AsyncSessionLocal() as run_db:
                await agent_engine.run(
                    workspace_id=body.workspace_id,
                    conversation_id=conv.id,
                    user_content=body.instruction,
                    db=run_db,
                    agent=agent_def,
                    execution_id=str(execution_id),
                )

        asyncio.create_task(_run())

    return {"execution_id": str(execution_id), "conversation_id": str(conv.id)}


# ── Persistent Agent Memory ──


@router.post("/memory/store")
async def memory_store(
    body: AgentMemoryStoreRequest,
    db: AsyncSession = Depends(get_db),
):
    """Store a persistent agent memory entry."""
    from openforge.services.agent_memory_service import agent_memory_service

    memory = await agent_memory_service.store(
        db=db,
        workspace_id=body.workspace_id,
        agent_id=body.agent_id,
        content=body.content,
        memory_type=body.memory_type,
        confidence=body.confidence,
    )
    return {"id": str(memory.id), "status": "stored"}


@router.post("/memory/recall")
async def memory_recall(
    body: AgentMemoryRecallRequest,
    db: AsyncSession = Depends(get_db),
):
    """Recall persistent agent memories via semantic search."""
    from openforge.services.agent_memory_service import agent_memory_service

    results = await agent_memory_service.recall(
        db=db,
        workspace_id=body.workspace_id,
        query=body.query,
        limit=body.limit,
        agent_id=body.agent_id,
    )
    return {"memories": results}


@router.post("/memory/forget")
async def memory_forget(
    body: AgentMemoryForgetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Forget (soft-delete) a persistent memory entry."""
    from openforge.services.agent_memory_service import agent_memory_service

    ok = await agent_memory_service.forget(db=db, memory_id=body.memory_id)
    if not ok:
        raise HTTPException(404, "Memory not found")
    return {"status": "forgotten"}
