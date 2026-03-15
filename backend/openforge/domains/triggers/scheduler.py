"""
Trigger scheduler.

Polls enabled cron/interval/heartbeat triggers and dispatches launches
when their next_fire_at time has passed.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from croniter import croniter
from sqlalchemy import select

from openforge.db.models import TriggerDefinitionModel
from openforge.db.postgres import AsyncSessionLocal
from openforge.domains.common.enums import TriggerType
from openforge.domains.triggers.service import TriggerService

logger = logging.getLogger("openforge.triggers.scheduler")

# Trigger types that the scheduler polls
_SCHEDULED_TYPES = {TriggerType.CRON, TriggerType.INTERVAL, TriggerType.HEARTBEAT}


class TriggerScheduler:
    """Polls enabled triggers and dispatches launches."""

    def __init__(self, poll_seconds: int = 30):
        self._poll_seconds = max(10, poll_seconds)
        self._loop_task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._loop_task and not self._loop_task.done():
            return
        self._stop_event = asyncio.Event()
        await self.rehydrate()
        self._loop_task = asyncio.create_task(
            self._run_loop(), name="openforge-trigger-scheduler"
        )
        logger.info("Trigger scheduler started (poll every %ss).", self._poll_seconds)

    async def stop(self) -> None:
        if not self._loop_task:
            return
        self._stop_event.set()
        self._loop_task.cancel()
        try:
            await self._loop_task
        except asyncio.CancelledError:
            logger.debug("Trigger scheduler task cancelled during stop.")
        except Exception as e:
            logger.warning("Trigger scheduler operation failed: %s", e)
        finally:
            self._loop_task = None
        logger.info("Trigger scheduler stopped.")

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Trigger scheduler tick failed.")

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self._poll_seconds
                )
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        """Check all enabled scheduled triggers and fire those that are due."""
        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            query = (
                select(TriggerDefinitionModel)
                .where(
                    TriggerDefinitionModel.is_enabled.is_(True),
                    TriggerDefinitionModel.trigger_type.in_(
                        [t.value for t in _SCHEDULED_TYPES]
                    ),
                    TriggerDefinitionModel.next_fire_at.isnot(None),
                    TriggerDefinitionModel.next_fire_at <= now,
                )
            )
            result = await db.execute(query)
            due_triggers = result.scalars().all()

            for trigger in due_triggers:
                try:
                    await self._fire_trigger(db, trigger, now)
                except Exception:
                    logger.exception(
                        "Failed to fire trigger %s (%s).", trigger.id, trigger.name
                    )

    async def _fire_trigger(
        self,
        db,
        trigger: TriggerDefinitionModel,
        now: datetime,
    ) -> None:
        """Fire a single trigger: record history, dispatch launch, update schedule."""
        from openforge.runtime.launching import LaunchService

        service = TriggerService(db)
        launch_service = LaunchService(db)

        # Dispatch the launch
        launch_status = "success"
        error_message = None
        run_id = None
        try:
            launch_result = await launch_service.launch_trigger(
                trigger_id=trigger.id,
                workspace_id=trigger.workspace_id,
                context=trigger.payload_template,
            )
            run_id_raw = launch_result.get("run_id")
            if run_id_raw:
                from uuid import UUID as _UUID

                run_id = _UUID(str(run_id_raw)) if not isinstance(run_id_raw, _UUID) else run_id_raw
        except Exception as exc:
            launch_status = "error"
            error_message = str(exc)
            logger.warning(
                "Trigger %s launch failed: %s", trigger.id, error_message
            )

        # Record fire history
        await service.record_fire(
            trigger_id=trigger.id,
            launch_status=launch_status,
            mission_id=trigger.target_id if trigger.target_type == "mission" else None,
            run_id=run_id,
            error_message=error_message,
            payload_snapshot=trigger.payload_template,
        )

        # Update last_fired_at BEFORE computing next_fire_at (which depends on it)
        trigger.last_fired_at = now
        next_fire = self._compute_next_fire(trigger, now)
        trigger.next_fire_at = next_fire
        await db.commit()

        logger.info(
            "Trigger %s (%s) fired. Next fire at: %s",
            trigger.id,
            trigger.name,
            next_fire,
        )

    async def rehydrate(self) -> None:
        """On startup: recompute next_fire_at for all enabled scheduled triggers."""
        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            query = (
                select(TriggerDefinitionModel)
                .where(
                    TriggerDefinitionModel.is_enabled.is_(True),
                    TriggerDefinitionModel.trigger_type.in_(
                        [t.value for t in _SCHEDULED_TYPES]
                    ),
                )
            )
            result = await db.execute(query)
            triggers = result.scalars().all()

            updated = 0
            for trigger in triggers:
                next_fire = self._compute_next_fire(trigger, now)
                if next_fire != trigger.next_fire_at:
                    trigger.next_fire_at = next_fire
                    updated += 1

            if updated:
                await db.commit()
                logger.info(
                    "Rehydrated next_fire_at for %d trigger(s).", updated
                )

    def _compute_next_fire(
        self,
        trigger: TriggerDefinitionModel,
        now: Optional[datetime] = None,
    ) -> Optional[datetime]:
        """Compute the next fire time for a scheduled trigger."""
        if now is None:
            now = datetime.now(timezone.utc)

        trigger_type = trigger.trigger_type

        if trigger_type == TriggerType.CRON and trigger.schedule_expression:
            try:
                cron = croniter(trigger.schedule_expression, now)
                return cron.get_next(datetime)
            except (ValueError, KeyError):
                logger.warning(
                    "Invalid cron expression for trigger %s: %s",
                    trigger.id,
                    trigger.schedule_expression,
                )
                return None

        if trigger_type in (
            TriggerType.INTERVAL,
            TriggerType.HEARTBEAT,
        ) and trigger.interval_seconds:
            base = trigger.last_fired_at if trigger.last_fired_at else now
            next_time = base + timedelta(seconds=trigger.interval_seconds)
            # If the computed next time is in the past, snap to now + interval
            if next_time <= now:
                next_time = now + timedelta(seconds=trigger.interval_seconds)
            return next_time

        return None


trigger_scheduler = TriggerScheduler()
