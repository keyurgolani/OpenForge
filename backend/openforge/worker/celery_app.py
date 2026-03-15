"""Celery application configuration for agent execution workers."""

import logging
from celery import Celery
from celery.signals import worker_init
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

# Auto-discover tasks
celery_app.autodiscover_tasks(["openforge.worker"])


@worker_init.connect
def register_system_profiles(**_kwargs):
    """Register system profiles when the Celery worker starts."""
    from openforge.runtime.profile_registry import profile_registry

    profile_registry.register_system_profiles()
    logger.info("Celery worker: registered %d system profiles.", len(profile_registry.list_all()))
