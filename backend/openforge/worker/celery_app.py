"""Celery application configuration for agent execution workers."""

import logging
from celery import Celery, signals
from celery.schedules import crontab
from openforge.common.config import get_settings

logger = logging.getLogger("openforge.worker")

settings = get_settings()

celery_app = Celery(
    "openforge",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_cancel_long_running_tasks_on_connection_loss=True,
)

# Use logarithmic autoscaler when --autoscale is passed
celery_app.conf.worker_autoscaler = "openforge.worker.autoscale:LogarithmicAutoscaler"

# Deployment scheduler beat schedule
celery_app.conf.beat_schedule = {
    "poll-deployments": {
        "task": "deployment.poll",
        "schedule": 30.0,
    },
    "poll-missions": {
        "task": "mission.poll",
        "schedule": 60.0,
    },
    "poll-reminders": {
        "task": "scheduler.poll_reminders",
        "schedule": 15.0,
    },
    "memory-consolidation": {
        "task": "memory.consolidate",
        "schedule": 900,  # 15 minutes
    },
    "memory-learning-extraction": {
        "task": "memory.learning_extraction",
        "schedule": crontab(hour=3, minute=0),
    },
    "memory-lint": {
        "task": "memory.lint",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),
    },
    "memory-mirror-sync": {
        "task": "memory.mirror_sync",
        "schedule": 3600,  # 1 hour
    },
}

# Auto-discover tasks
celery_app.autodiscover_tasks(["openforge.worker", "openforge.memory"])


@signals.worker_ready.connect
def _cleanup_stale_executions(**kwargs):
    """Mark any executions stuck in 'running' as 'failed' on worker startup.

    This handles the case where the worker was killed mid-inference,
    leaving execution records in 'running' state that block new chats.
    """
    import asyncio

    async def _cleanup():
        try:
            from openforge.db.postgres import AsyncSessionLocal
            from sqlalchemy import text

            async with AsyncSessionLocal() as db:
                result = await db.execute(text(
                    "UPDATE agent_executions SET status='failed', "
                    "error_message='Worker restarted during execution' "
                    "WHERE status = 'running'"
                ))
                count = result.rowcount
                if count:
                    await db.commit()
                    logger.info("Cleaned up %d stale 'running' execution(s) on worker startup", count)
        except Exception as e:
            logger.warning("Failed to clean up stale executions: %s", e)

    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_cleanup())
        loop.close()
    except Exception as e:
        logger.warning("Stale execution cleanup error: %s", e)
