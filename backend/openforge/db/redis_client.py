"""Async Redis client for agent event relay and stream state."""

from __future__ import annotations

import asyncio

import redis.asyncio as aioredis
from openforge.common.config import get_settings

_redis: aioredis.Redis | None = None
_redis_loop_id: int | None = None


async def get_redis() -> aioredis.Redis:
    """Return a shared async Redis connection.

    Re-creates the connection when the running event loop changes (e.g. Celery
    workers create a new loop per task), preventing stale-connection errors.
    """
    global _redis, _redis_loop_id
    current_loop_id = id(asyncio.get_running_loop())
    if _redis is None or _redis_loop_id != current_loop_id:
        # Close old connection if switching loops
        if _redis is not None:
            try:
                await _redis.aclose()
            except Exception:
                pass
        settings = get_settings()
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
        _redis_loop_id = current_loop_id
    return _redis


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
