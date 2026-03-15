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


task_scheduler = TaskScheduler()
