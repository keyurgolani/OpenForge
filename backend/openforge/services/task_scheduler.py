import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import desc, select

from openforge.api.tasks import TASK_CATALOGUE, TaskRunRequest, run_task_now
from openforge.db.models import Config, TaskLog
from openforge.db.postgres import AsyncSessionLocal

logger = logging.getLogger("openforge.task_scheduler")


def _parse_interval_hours(raw: object, fallback: int) -> int:
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return max(1, fallback)
    return max(1, value)


def _parse_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


class TaskScheduler:
    """Periodic scheduler that triggers enabled background task runs."""

    def __init__(self, poll_seconds: int = 60) -> None:
        self._poll_seconds = max(10, poll_seconds)
        self._loop_task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._loop_task and not self._loop_task.done():
            return
        self._stop_event = asyncio.Event()
        self._loop_task = asyncio.create_task(self._run_loop(), name="openforge-task-scheduler")
        logger.info("Task scheduler started (poll every %ss).", self._poll_seconds)

    async def stop(self) -> None:
        if not self._loop_task:
            return
        self._stop_event.set()
        self._loop_task.cancel()
        try:
            await self._loop_task
        except asyncio.CancelledError:
            pass
        finally:
            self._loop_task = None
        logger.info("Task scheduler stopped.")

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Task scheduler tick failed.")

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_seconds)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        now = datetime.now(timezone.utc)
        await self._check_agent_schedules(now)
        async with AsyncSessionLocal() as db:
            cfg_result = await db.execute(select(Config).where(Config.category == "schedule"))
            schedule_configs: dict[str, dict] = {
                row.key: (row.value if isinstance(row.value, dict) else {})
                for row in cfg_result.scalars().all()
            }

            for task_entry in TASK_CATALOGUE:
                task_id = task_entry["id"]
                config_key = f"schedule.{task_id}"
                cfg = schedule_configs.get(config_key, {})
                enabled = bool(cfg.get("enabled", task_entry["default_enabled"]))
                if not enabled:
                    continue

                interval_hours = _parse_interval_hours(
                    cfg.get("interval_hours"),
                    task_entry["default_interval_hours"],
                )
                interval = timedelta(hours=interval_hours)

                running_result = await db.execute(
                    select(TaskLog)
                    .where(TaskLog.task_type == task_id, TaskLog.status == "running")
                    .order_by(desc(TaskLog.started_at))
                    .limit(1)
                )
                running_log = running_result.scalar_one_or_none()
                if running_log:
                    running_for = now - running_log.started_at
                    stale_after = max(interval, timedelta(hours=1))
                    if running_for < stale_after:
                        continue
                    logger.warning(
                        "Ignoring stale running log for scheduled task '%s' (running for %s).",
                        task_id,
                        running_for,
                    )

                last_run_result = await db.execute(
                    select(TaskLog.started_at)
                    .where(TaskLog.task_type == task_id)
                    .order_by(desc(TaskLog.started_at))
                    .limit(1)
                )
                last_started_at = last_run_result.scalar_one_or_none()
                if last_started_at and (now - last_started_at) < interval:
                    continue

                body: TaskRunRequest | None = None
                if task_entry.get("supports_target_scope"):
                    target_scope = cfg.get("target_scope", task_entry.get("default_target_scope"))
                    if target_scope not in {"one", "remaining", "all"}:
                        target_scope = task_entry.get("default_target_scope")
                    body = TaskRunRequest(
                        target_scope=target_scope,
                        knowledge_id=_parse_uuid(cfg.get("knowledge_id")) if target_scope == "one" else None,
                    )

                try:
                    await run_task_now(task_id=task_id, body=body, db=db)
                    logger.info("Scheduled task enqueued: %s", task_id)
                except HTTPException as exc:
                    logger.warning("Skipping scheduled task '%s': %s", task_id, exc.detail)
                except Exception as exc:
                    logger.warning("Failed to enqueue scheduled task '%s': %s", task_id, exc)


    async def _check_agent_schedules(self, now: datetime) -> None:
        """Check for due agent schedules and trigger them."""
        try:
            from croniter import croniter
            from openforge.db.models import AgentSchedule
            from openforge.core.agent_registry import agent_registry

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(AgentSchedule).where(
                        AgentSchedule.is_enabled == True,
                        AgentSchedule.next_run_at <= now,
                    )
                )
                due_schedules = result.scalars().all()

                for schedule in due_schedules:
                    try:
                        agent_def = agent_registry.get(schedule.agent_id)
                        if not agent_def:
                            logger.warning("Scheduled agent '%s' not found, skipping.", schedule.agent_id)
                            continue

                        # Trigger the agent via the internal trigger mechanism
                        import uuid as _uuid_mod
                        from openforge.db.models import AgentExecution, Conversation

                        conv = Conversation(
                            workspace_id=schedule.workspace_id,
                            title=f"Scheduled: {schedule.name}",
                            is_subagent=False,
                        )
                        db.add(conv)
                        await db.flush()

                        execution_id = _uuid_mod.uuid4()
                        db.add(AgentExecution(
                            id=execution_id,
                            workspace_id=schedule.workspace_id,
                            conversation_id=conv.id,
                            agent_id=schedule.agent_id,
                            status="queued",
                        ))

                        # Update schedule metadata
                        schedule.last_run_at = now
                        schedule.run_count += 1
                        cron = croniter(schedule.cron_expression, now)
                        schedule.next_run_at = cron.get_next(datetime).replace(tzinfo=timezone.utc)

                        await db.commit()

                        # Dispatch execution
                        from openforge.config import get_settings
                        settings = get_settings()

                        if settings.use_celery_agents:
                            try:
                                from openforge.worker.tasks import execute_agent_task
                                execute_agent_task.delay(
                                    execution_id=str(execution_id),
                                    workspace_id=str(schedule.workspace_id),
                                    conversation_id=str(conv.id),
                                    user_message=schedule.instruction,
                                    agent_id=schedule.agent_id,
                                    agent_enabled=agent_def.tools_enabled,
                                    agent_tool_categories=agent_def.allowed_tool_categories or [],
                                    agent_max_tool_loops=agent_def.max_iterations,
                                    attachment_ids=[],
                                    provider_id=None,
                                    model_id=None,
                                    mentions=[],
                                )
                            except Exception as e:
                                logger.warning("Celery dispatch for schedule '%s' failed: %s", schedule.name, e)
                        else:
                            import asyncio
                            from openforge.services.agent_execution_engine import agent_engine

                            _wid = schedule.workspace_id
                            _cid = conv.id
                            _inst = schedule.instruction
                            _eid = str(execution_id)
                            _agent = agent_def

                            async def _run_scheduled():
                                async with AsyncSessionLocal() as run_db:
                                    await agent_engine.run(
                                        workspace_id=_wid,
                                        conversation_id=_cid,
                                        user_content=_inst,
                                        db=run_db,
                                        agent=_agent,
                                        execution_id=_eid,
                                    )

                            asyncio.create_task(_run_scheduled())

                        logger.info("Scheduled agent '%s' triggered for workspace %s.", schedule.name, schedule.workspace_id)
                    except Exception as e:
                        logger.warning("Failed to trigger schedule '%s': %s", schedule.name, e)
        except ImportError:
            # croniter not installed — skip silently
            pass
        except Exception as e:
            logger.warning("Agent schedule check failed: %s", e)


task_scheduler = TaskScheduler()
