"""
Celery application configuration for OpenForge v2.

Celery workers execute agent loops and background tasks,
communicating via Redis as the message broker and result backend.
"""
from celery import Celery
import os

# Get Redis URL from environment or use default
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "openforge",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,  # One task at a time per worker
    task_default_queue="agent_tasks",
    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    # Task routing
    task_routes={
        "agent.execute": {"queue": "agent_tasks"},
        "agent.resume_after_hitl": {"queue": "agent_tasks"},
        "knowledge.process_file": {"queue": "knowledge_processing"},
    },
)

# Auto-discover tasks in the worker module
celery_app.autodiscover_tasks(["openforge.worker"])
