"""Celery application configuration for agent execution workers."""

import logging
from celery import Celery
from celery.signals import worker_init
from openforge.config import get_settings

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
def register_system_agents(**_kwargs):
    """Register system agent definitions when the Celery worker starts."""
    from openforge.core.agent_registry import (
        agent_registry, WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT,
    )
    for agent_def in [WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT]:
        agent_registry.register_system_agent(agent_def)
    logger.info("Celery worker: registered %d system agents.", len(agent_registry.list_all()))
