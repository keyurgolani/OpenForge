"""
Infrastructure: Celery application setup.

Expose the shared Celery app through the infrastructure package boundary.
"""

from __future__ import annotations

from openforge.worker.celery_app import celery_app


def get_celery_app():
    """Return the shared Celery app instance."""
    return celery_app


__all__ = ["celery_app", "get_celery_app"]
