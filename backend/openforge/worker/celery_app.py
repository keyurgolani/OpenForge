"""Celery application configuration for agent execution workers."""

from celery import Celery
from openforge.config import get_settings

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
