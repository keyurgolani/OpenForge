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


@celery_app.task(name="workflow.execute_run", bind=True, max_retries=0)
def execute_workflow_run_task(self, run_id: str):
    """Celery task that executes a pending workflow run via the runtime coordinator."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_workflow(run_id))
    except Exception as exc:
        logger.error("Workflow run task %s failed: %s", run_id, exc)
        loop.run_until_complete(_mark_run_failed(run_id, str(exc)))
        raise
    finally:
        loop.close()


async def _run_workflow(run_id: str):
    """Async wrapper that creates a DB session and executes the workflow run."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from openforge.config import get_settings
    from openforge.core.llm_gateway import LLMGateway
    from openforge.domains.artifacts.service import ArtifactService
    from openforge.domains.policies.approval_service import ApprovalService
    from openforge.domains.workflows.service import WorkflowService
    from openforge.runtime.checkpoint_store import CheckpointStore
    from openforge.runtime.coordinator import RuntimeCoordinator
    from openforge.runtime.event_publisher import EventPublisher
    from openforge.runtime.profile_registry import profile_registry
    from openforge.services.llm_service import LLMService

    _register_system_profiles()

    settings = get_settings()
    worker_engine = create_async_engine(
        settings.database_url, echo=False, pool_size=5, max_overflow=10,
    )
    WorkerSession = async_sessionmaker(
        worker_engine, class_=AsyncSession, expire_on_commit=False,
    )
    try:
        async with WorkerSession() as db:
            await profile_registry.ensure_system_profiles(db)
            await profile_registry.load_profiles(db)

            llm_service = LLMService()
            llm_gateway = LLMGateway()

            coordinator = RuntimeCoordinator(
                db=db,
                workflow_service=WorkflowService(db),
                artifact_service=ArtifactService(db),
                approval_service=ApprovalService(db),
                checkpoint_store=CheckpointStore(db),
                event_publisher=EventPublisher(db),
                profile_registry=profile_registry,
                llm_service=llm_service,
                llm_gateway=llm_gateway,
            )
            await coordinator.execute_existing_run(UUID(run_id))
    finally:
        await worker_engine.dispose()


async def _mark_run_failed(run_id: str, error_message: str):
    """Mark a run record as failed after a crash."""
    try:
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
        from openforge.config import get_settings
        from openforge.db.models import RunModel

        settings = get_settings()
        tmp_engine = create_async_engine(settings.database_url, echo=False, pool_size=2)
        TmpSession = async_sessionmaker(tmp_engine, class_=AsyncSession, expire_on_commit=False)
        try:
            async with TmpSession() as db:
                run = await db.get(RunModel, UUID(run_id))
                if run and run.status in ("pending", "queued", "running"):
                    run.status = "failed"
                    run.output_payload = {"error": error_message[:2000]}
                    await db.commit()
        finally:
            await tmp_engine.dispose()
    except Exception as exc:
        logger.warning("Failed to mark run %s as failed: %s", run_id, exc)


def _register_system_profiles():
    """Ensure system profiles are registered in this process."""
    from openforge.runtime.profile_registry import profile_registry

    if not profile_registry.list_all():
        profile_registry.register_system_profiles()


async def _run_agent(execution_id: str, **kwargs):
    """Async wrapper that sets up DB session and runs the engine."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from openforge.config import get_settings
    from openforge.runtime.execution_engine import agent_engine
    from openforge.runtime.profile_registry import profile_registry

    _register_system_profiles()

    agent_id = kwargs.get("agent_id", "workspace_agent")
    agent = profile_registry.get(agent_id) or profile_registry.get_default()

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
            await profile_registry.ensure_system_profiles(db)
            await profile_registry.load_profiles(db)
            agent = profile_registry.get(agent_id) or profile_registry.get_default()
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
