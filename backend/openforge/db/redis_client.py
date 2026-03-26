"""Async Redis client for agent event relay and stream state."""

from __future__ import annotations

import asyncio
import threading

import redis.asyncio as aioredis
from openforge.common.config import get_settings

# Per-event-loop Redis connections.  Celery thread-pool workers run concurrent
# tasks each with their own asyncio event loop.  A single global connection
# would be closed/replaced by whichever task runs last, breaking the other.
# Using a dict keyed by loop id lets each loop keep its own connection.
_redis_by_loop: dict[int, aioredis.Redis] = {}
_lock = threading.Lock()


async def get_redis() -> aioredis.Redis:
    """Return an async Redis connection bound to the current event loop.

    Each distinct event loop (e.g. per-Celery-task) gets its own connection so
    that concurrent threads never close each other's connections.
    """
    loop_id = id(asyncio.get_running_loop())
    conn = _redis_by_loop.get(loop_id)
    if conn is not None:
        return conn

    settings = get_settings()
    conn = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=20,
    )
    with _lock:
        _redis_by_loop[loop_id] = conn
    return conn


async def close_redis() -> None:
    """Close the Redis connection for the current event loop."""
    loop_id = id(asyncio.get_running_loop())
    with _lock:
        conn = _redis_by_loop.pop(loop_id, None)
    if conn is not None:
        await conn.aclose()


async def close_all_redis() -> None:
    """Close all Redis connections (used during shutdown)."""
    with _lock:
        conns = list(_redis_by_loop.values())
        _redis_by_loop.clear()
    for conn in conns:
        try:
            await conn.aclose()
        except Exception:
            pass
