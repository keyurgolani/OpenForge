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


async def _run_agent(execution_id: str, **kwargs):
    """Async wrapper that sets up DB session and runs the engine."""
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.services.agent_execution_engine import agent_engine
    from openforge.core.agent_registry import agent_registry

    agent_id = kwargs.get("agent_id", "workspace_agent")
    agent = agent_registry.get(agent_id)
    if not agent:
        from openforge.core.agent_registry import WORKSPACE_AGENT
        agent = WORKSPACE_AGENT

    # Apply workspace overrides if provided
    if kwargs.get("agent_enabled") is not None:
        agent = agent.merge_workspace_overrides(
            agent_enabled=kwargs.get("agent_enabled", True),
            agent_tool_categories=kwargs.get("agent_tool_categories", []),
            agent_max_tool_loops=kwargs.get("agent_max_tool_loops", 20),
        )

    async with AsyncSessionLocal() as db:
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
        )


async def _mark_execution_failed(execution_id: str, error_message: str):
    """Mark an execution record as failed after a crash."""
    from datetime import datetime, timezone

    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import AgentExecution

        async with AsyncSessionLocal() as db:
            exec_record = await db.get(AgentExecution, UUID(execution_id))
            if exec_record and exec_record.status in ("queued", "running"):
                exec_record.status = "failed"
                exec_record.error_message = error_message[:2000]
                exec_record.completed_at = datetime.now(timezone.utc)
                await db.commit()
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
            "type": "chat_error",
            "execution_id": execution_id,
            "workspace_id": "",
            "detail": f"Agent execution failed: {error_message[:500]}",
        }))
        await r.aclose()
    except Exception:
        pass
