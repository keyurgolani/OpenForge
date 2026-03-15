"""Celery tasks for agent execution."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from openforge.worker.celery_app import celery_app

logger = logging.getLogger("openforge.worker.tasks")


@celery_app.task(name="agent.execute", bind=True, max_retries=0)
def execute_agent_task(self, execution_id: str, **kwargs):
    """Celery task that runs the agent execution engine in an asyncio event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_agent(execution_id, **kwargs))
    except Exception as exc:
        logger.error("Agent task %s failed: %s", execution_id, exc)
        # Mark execution as failed
        loop.run_until_complete(_mark_execution_failed(execution_id, str(exc)))
        raise
    finally:
        loop.close()


def _ensure_system_agents():
    """Ensure system agents are registered in this process."""
    from openforge.runtime.transitional_agents import (
        agent_registry, WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT,
    )
    if not agent_registry.list_all():
        for agent_def in [WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT]:
            agent_registry.register_system_agent(agent_def)


async def _run_agent(execution_id: str, **kwargs):
    """Async wrapper that sets up DB session and runs the engine."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from openforge.config import get_settings
    from openforge.runtime.execution_engine import agent_engine
    from openforge.runtime.transitional_agents import agent_registry

    _ensure_system_agents()

    agent_id = kwargs.get("agent_id", "workspace_agent")
    agent = agent_registry.get(agent_id)
    if not agent:
        from openforge.runtime.transitional_agents import WORKSPACE_AGENT
        agent = WORKSPACE_AGENT

    # Apply workspace overrides if provided
    if kwargs.get("agent_enabled") is not None:
        agent = agent.merge_workspace_overrides(
            agent_enabled=kwargs.get("agent_enabled", True),
            agent_tool_categories=kwargs.get("agent_tool_categories", []),
            agent_max_tool_loops=kwargs.get("agent_max_tool_loops", 20),
        )

    # Create a fresh engine bound to THIS event loop to avoid asyncpg
    # "another operation is in progress" errors from cross-loop pool reuse.
    settings = get_settings()
    worker_engine = create_async_engine(
        settings.database_url, echo=False, pool_size=5, max_overflow=10,
    )
    WorkerSession = async_sessionmaker(
        worker_engine, class_=AsyncSession, expire_on_commit=False,
    )
    try:
        async with WorkerSession() as db:
            await agent_engine.run(
                execution_id=execution_id,
                workspace_id=UUID(kwargs["workspace_id"]),
                conversation_id=UUID(kwargs["conversation_id"]),
                user_content=kwargs["user_message"],
                db=db,
                agent=agent,
                attachment_ids=kwargs.get("attachment_ids"),
                provider_id=kwargs.get("provider_id"),
                model_id=kwargs.get("model_id"),
                mentions=kwargs.get("mentions"),
                optimize=kwargs.get("optimize", False),
            )
    finally:
        await worker_engine.dispose()


async def _mark_execution_failed(execution_id: str, error_message: str):
    """Mark an execution record as failed after a crash."""
    from datetime import datetime, timezone

    try:
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
        from openforge.config import get_settings
        from openforge.db.models import AgentExecution

        settings = get_settings()
        tmp_engine = create_async_engine(settings.database_url, echo=False, pool_size=2)
        TmpSession = async_sessionmaker(tmp_engine, class_=AsyncSession, expire_on_commit=False)
        try:
            async with TmpSession() as db:
                exec_record = await db.get(AgentExecution, UUID(execution_id))
                if exec_record and exec_record.status in ("queued", "running"):
                    exec_record.status = "failed"
                    exec_record.error_message = error_message[:2000]
                    exec_record.completed_at = datetime.now(timezone.utc)
                    await db.commit()
        finally:
            await tmp_engine.dispose()
    except Exception as exc:
        logger.warning("Failed to mark execution %s as failed: %s", execution_id, exc)

    # Also publish error event to Redis
    try:
        import json
        import redis.asyncio as aioredis
        from openforge.config import get_settings

        settings = get_settings()
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await r.publish(f"agent:{execution_id}", json.dumps({
            "type": "agent_error",
            "execution_id": execution_id,
            "workspace_id": "",
            "detail": f"Agent execution failed: {error_message[:500]}",
        }))
        await r.aclose()
    except Exception:
        pass
