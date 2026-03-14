"""
Infrastructure Redis client wrapper.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from redis import asyncio as redis_async
from redis.exceptions import RedisError

from openforge.common.config import get_settings

logger = logging.getLogger("openforge.redis")


class RedisClient:
    """Small async Redis wrapper used by infrastructure code."""

    def __init__(self, url: str = "redis://localhost:6379/0"):
        self._url = url
        self._client: Optional[redis_async.Redis] = None

    async def connect(self) -> None:
        if self._client is None:
            try:
                self._client = redis_async.from_url(self._url)
                logger.info("Connected to Redis at %s", self._url)
            except RedisError as exc:
                logger.error("Failed to connect to Redis at %s: %s", self._url, exc)
                raise

    async def disconnect(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
                logger.info("Disconnected from Redis at %s", self._url)
            finally:
                self._client = None

    async def close(self) -> None:
        await self.disconnect()

    async def _require_client(self) -> redis_async.Redis:
        await self.connect()
        assert self._client is not None
        return self._client

    async def get(self, key: str) -> Any:
        client = await self._require_client()
        return await client.get(key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> bool:
        client = await self._require_client()
        return bool(await client.set(key, value, ex=ttl))

    async def delete(self, key: str) -> int:
        client = await self._require_client()
        return int(await client.delete(key))

    async def exists(self, key: str) -> bool:
        client = await self._require_client()
        return bool(await client.exists(key))

    async def expire(self, key: str, ttl: int) -> bool:
        client = await self._require_client()
        return bool(await client.expire(key, ttl))

    async def keys(self, pattern: str) -> list[str]:
        client = await self._require_client()
        return [key async for key in client.scan_iter(match=pattern)]

    async def publish(self, channel: str, message: Any) -> int:
        client = await self._require_client()
        return int(await client.publish(channel, message))


redis_client: Optional[RedisClient] = None


async def get_redis_client() -> RedisClient:
    """Get the process-wide Redis client singleton."""
    global redis_client
    if redis_client is None:
        redis_client = RedisClient(url=get_settings().redis_url)
    return redis_client


async def close_redis() -> None:
    """Close the process-wide Redis client singleton."""
    global redis_client
    if redis_client is not None:
        await redis_client.disconnect()
        redis_client = None
