"""Celery tasks for agent execution."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
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
    from openforge.domains.agents.compiled_spec import AgentRuntimeConfig, build_runtime_config_from_snapshot
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

            # Resolve the AgentRuntimeConfig from run metadata
            metadata = run.composite_metadata or {}
            spec: AgentRuntimeConfig | None = None

            automation_id = metadata.get("automation_id")
            agent_id = metadata.get("agent_id")
            is_multi_node = metadata.get("is_multi_node", False)

            # Check for multi-node automation
            if is_multi_node and automation_id:
                from openforge.db.models import CompiledAutomationSpecModel
                from openforge.domains.automations.compiled_spec import CompiledAutomationSpec as CompiledAutoSpec
                from openforge.runtime.graph_executor import GraphExecutor

                auto_spec_id = metadata.get("automation_spec_id")
                if auto_spec_id:
                    auto_spec_model = await db.get(CompiledAutomationSpecModel, UUID(auto_spec_id))
                    if auto_spec_model and auto_spec_model.resolved_config:
                        auto_spec = CompiledAutoSpec(**auto_spec_model.resolved_config)
                        graph_executor = GraphExecutor(
                            db,
                            event_publisher=EventPublisher(db),
                            checkpoint_store=CheckpointStore(db),
                            tool_dispatcher=tool_dispatcher,
                            llm_gateway=LLMGateway(),
                        )
                        deployment_inputs = (run.input_payload or {}).get("input_values", {})
                        result = await graph_executor.execute(run, auto_spec, deployment_inputs)
                        run.status = "completed"
                        run.output_payload = result
                        run.completed_at = datetime.now(timezone.utc)
                        await db.commit()
                        return

            if agent_id:
                agent = await db.get(AgentModel, UUID(agent_id))
                if agent and agent.active_version_id:
                    spec_model = await db.get(CompiledAgentSpecModel, agent.active_version_id)
                    if spec_model and spec_model.snapshot:
                        snapshot = spec_model.snapshot or {}
                        spec = build_runtime_config_from_snapshot(
                            snapshot=snapshot,
                            agent_id=spec_model.agent_id,
                            agent_slug=snapshot.get("slug", ""),
                            version=spec_model.version,
                            profile_id=UUID(int=0),
                        )

            # Fallback: resolve directly from agent_spec_id in metadata
            if spec is None:
                agent_spec_id = metadata.get("agent_spec_id")
                if agent_spec_id:
                    spec_model = await db.get(CompiledAgentSpecModel, UUID(agent_spec_id))
                    if spec_model and spec_model.snapshot:
                        snapshot = spec_model.snapshot or {}
                        spec = build_runtime_config_from_snapshot(
                            snapshot=snapshot,
                            agent_id=spec_model.agent_id,
                            agent_slug=snapshot.get("slug", ""),
                            version=spec_model.version,
                            profile_id=UUID(int=0),
                        )

            if spec is None:
                raise RuntimeError(f"Cannot resolve AgentRuntimeConfig for run {run_id}")

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

    ws_id_str = kwargs.get("workspace_id", "")
    workspace_id = UUID(ws_id_str) if ws_id_str else None

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
                workspace_id=workspace_id,
                conversation_id=UUID(kwargs["conversation_id"]),
                user_content=kwargs["user_message"],
                db=db,
                attachment_ids=kwargs.get("attachment_ids"),
                provider_id=kwargs.get("provider_id"),
                model_id=kwargs.get("model_id"),
                mentions=kwargs.get("mentions"),
            )
    finally:
        await worker_engine.dispose()


async def _mark_execution_failed(execution_id: str, error_message: str):
    """Mark an execution record as failed after a crash."""
    from datetime import datetime, timezone

    event_workspace_id = ""
    event_conversation_id = ""

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
                    event_workspace_id = str(exec_record.workspace_id) if exec_record.workspace_id else ""
                    event_conversation_id = str(exec_record.conversation_id) if exec_record.conversation_id else ""
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
            "workspace_id": event_workspace_id,
            "conversation_id": event_conversation_id,
            "detail": f"Agent execution failed: {error_message[:500]}",
        }))
        await r.aclose()
    except Exception:
        pass


@celery_app.task(name="deployment.poll")
def poll_deployments():
    """Celery Beat task: poll for due deployments and fire runs."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from openforge.config import get_settings
    from openforge.runtime.deployment_scheduler import poll_and_fire

    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    loop = asyncio.new_event_loop()
    try:
        async def _run():
            try:
                async with Session() as db:
                    count = await poll_and_fire(db)
                    if count:
                        logger.info("Fired %d deployment(s)", count)
            finally:
                await engine.dispose()

        loop.run_until_complete(_run())
    finally:
        loop.close()
