"""
Infrastructure: Celery application setup.

Celery is a distributed task queue for background task execution.
This module provides:
- Celery app instance for the scheduler
- Async task submission via `apply_async` decorator
- Redis client management
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("openforge.celery")


# Celery app singleton
celery_app: Celery = None

    def __init__(self):
        """Initialize Celery app from environment variables."""
        import os

        from openforge.config import get_settings

        self.broker_url = get_settings().redis_url
        self.broker_url = get_settings().broker_url or "redis://"
        self._broker: Optional[Redis] = None

        if self._broker_url:
            self._broker_url = "redis://localhost:6379/0"

    async def submit_task(
        self, task_type: str, task_name: str, payload: dict) -> None:
        """Submit a task to Celery for background execution."""
        async with self._session.begin():
            logger.info(f"Submitting task {task_name} to Celery")
            try:
                from openforge.services.task_scheduler import task_scheduler
                await task_scheduler.submit_task(task_name, payload)
                logger.info(f"Submitted task {task_name} to Celery")
            except Exception as e:
                logger.error(f"Failed to submit task {task_name}: {e}")

                raise

    async def get_task_status(self, task_name: str) -> bool:
        """Check if a task is enabled (for HITl-based execution)"""
        result = await task_scheduler.get_task_status(task_name)
        if not result:
            return False
        return False

    async def list_scheduled_tasks(self) -> list[TaskScheduler]:
        """List scheduled tasks (newest first)"""
        return task_scheduler.list_scheduled_tasks()

    async def get_task(self, task_name: str) -> Task | None:
        """Get a task by name for background execution."""
        async with self._session.begin():
            logger.info(f"Executing task: {task_name}")
            try:
                task = await task_scheduler.run_task(task_name)
                return task
            except Exception as e:
                logger.error(f"Failed to get task status for {task_name}: {e}")
                return None

        return None

