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


@celery_app.task(name="strategy.execute", bind=True, max_retries=0)
def execute_agent_strategy(self, run_id: str):
    """Celery task that executes an agent strategy run."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_strategy(run_id))
    except Exception as exc:
        logger.error("Strategy run task %s failed: %s", run_id, exc)
        loop.run_until_complete(_mark_run_failed(run_id, str(exc)))
        raise
    finally:
        loop.close()


async def _run_strategy(run_id: str):
    """Async wrapper that resolves the agent spec and executes the strategy."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from openforge.config import get_settings
    from openforge.core.llm_gateway import LLMGateway
    from openforge.db.models import RunModel, AutomationModel, AgentModel, CompiledAgentSpecModel
    from openforge.domains.agents.compiled_spec import CompiledAgentSpec
    from openforge.integrations.tools.dispatcher import tool_dispatcher
    from openforge.runtime.checkpoint_store import CheckpointStore
    from openforge.runtime.event_publisher import EventPublisher
    from openforge.runtime.strategy_executor import StrategyExecutor
    from openforge.runtime.strategies.registry import strategy_registry

    strategy_registry.load_builtins()

    settings = get_settings()
    worker_engine = create_async_engine(
        settings.database_url, echo=False, pool_size=5, max_overflow=10,
    )
    WorkerSession = async_sessionmaker(
        worker_engine, class_=AsyncSession, expire_on_commit=False,
    )
    try:
        async with WorkerSession() as db:
            run = await db.get(RunModel, UUID(run_id))
            if run is None:
                raise RuntimeError(f"Run {run_id} not found")

            # Resolve the CompiledAgentSpec from run metadata
            metadata = run.composite_metadata or {}
            spec: CompiledAgentSpec | None = None

            automation_id = metadata.get("automation_id")
            agent_id = metadata.get("agent_id")

            if automation_id:
                from openforge.db.models import AutomationModel
                automation = await db.get(AutomationModel, UUID(automation_id))
                if automation and automation.agent_id:
                    agent_id = str(automation.agent_id)

            if agent_id:
                agent = await db.get(AgentModel, UUID(agent_id))
                if agent and agent.active_spec_id:
                    spec_model = await db.get(CompiledAgentSpecModel, agent.active_spec_id)
                    if spec_model and spec_model.resolved_config:
                        spec = CompiledAgentSpec(**spec_model.resolved_config)

            if spec is None:
                raise RuntimeError(f"Cannot resolve CompiledAgentSpec for run {run_id}")

            executor = StrategyExecutor(
                db=db,
                event_publisher=EventPublisher(db),
                checkpoint_store=CheckpointStore(db),
                tool_dispatcher=tool_dispatcher,
                llm_gateway=LLMGateway(),
            )
            await executor.execute(
                spec,
                run.input_payload or {},
                workspace_id=run.workspace_id,
                run_id=run.id,
                run_type=run.run_type or "strategy",
            )
    finally:
        await worker_engine.dispose()


async def _run_agent(execution_id: str, **kwargs):
    """Async wrapper that sets up DB session and runs the chat handler."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from openforge.config import get_settings
    from openforge.runtime.chat_handler import chat_handler

    settings = get_settings()
    worker_engine = create_async_engine(
        settings.database_url, echo=False, pool_size=5, max_overflow=10,
    )
    WorkerSession = async_sessionmaker(
        worker_engine, class_=AsyncSession, expire_on_commit=False,
    )
    try:
        async with WorkerSession() as db:
            await chat_handler.run(
                execution_id=execution_id,
                workspace_id=UUID(kwargs["workspace_id"]),
                conversation_id=UUID(kwargs["conversation_id"]),
                user_content=kwargs["user_message"],
                db=db,
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
