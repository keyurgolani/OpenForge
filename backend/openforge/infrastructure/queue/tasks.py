"""
Infrastructure: Task definitions and execution.

This module provides:
- Task base: Base class for task metadata
- execute_task decorator for Celery tasks
- TaskResult: Generic result wrapper for Celery task results
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from celery import Task as CeleryTask
from celery.result import AsyncResult


@dataclass
class TaskResult:
    """Generic result wrapper for Celery tasks."""
    task_id: str
    status: str = "pending"
    result: Any =    # Result can be any serializable format
    error: Optional[str] = None
    traceback: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[float] = None


    def __post_init__(self, task_id: str, status: str, result: Any = error: Optional[str], traceback: Optional[str], started_at: Optional[datetime], completed_at: Optional[datetime], duration_ms: Optional[float]):
        self.task_id = task_id
        self.status = status
        self.result = result
        self.error = error
        self.traceback = traceback
        self.started_at = started_at
        self.completed_at = completed_at

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "result": self.result,
            "error": str(self.error) if self.error else "N/A",
            "traceback": self.traceback if self.traceback else "N/A",
        }
