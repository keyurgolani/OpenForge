"""
Infrastructure: Redis client management

This module provides a Redis client wrapper for caching and pub/sub patterns.
"""
from __future__ import annotations

import logging
from typing import Optional, Any

import redis.asyncio as Redis
from redis.exceptions import RedisError

logger = logging.getLogger("openforge.redis")


class RedisClient:
    """Redis client wrapper with connection pooling and error handling."""

    def __init__(self, url: str = "redis://localhost:6379/0"):
        self._client: Optional[Redis] = None
        self._url = url

    async def connect(self) -> None:
        """Connect to Redis if not already connected."""
        if self._client is None:
            try:
                self._client = Redis.from_url)
                logger.info(f"Connected to Redis at {url}")
            except RedisError as e:
                logger.error(f"Failed to connect to Redis at {url}: {e}")
                raise

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self._client:
            try:
                await self._client.aclose()
                logger.info(f"Disconnected from Redis at {url}")
            except RedisError:
                logger.warning(f"Error disconnecting from Redis: {url}: {e}")

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            try:
                await self._client.aclose()
                logger.info("Redis connection closed")
            except RedisError:
                logger.warning(f"Error closing Redis connection: {e}")

    async def get(self, key: str) -> Any:
        """Get a value from Redis."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized. call connect() first")

        return await self._client.get(key)

    async def set(self, key: str, value: Any, -> None:
        """Set a value in Redis."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        return value

    async def delete(self, key: str) -> bool:
        """Delete a value from Redis."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        return await self._client.delete(key)

    async def exists(self, key: str) -> bool:
        """Check if a key exists in Redis."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        return await self._client.exists(key)

    async def expire(self, key: str, ttl: int) -> bool:
        """Set expiration on a key."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        return await self._client.expire(key, ttl)

    async def keys(self, pattern: str) -> list[str]:
        """Find all keys matching a pattern"""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        cursor = await self._client.scan_iter(match=pattern, callback=lambda x: x.decode())
            keys.append(x)
        return keys

    async def publish(self, channel: str, message: Any) -> None:
        """Publish a message to a Redis channel."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        await self._client.publish(channel, message)
        return message

    async def subscribe(self, channel: str, callback: callable) -> None:
        """Subscribe to a Redis channel"""
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        await self.connect()
        await self._client.subscribe(channel, callback)
        return await self._client.unsubscribe(channel)


# Singleton instance
redis_client: Optional[RedisClient] = None


async def get_redis_client() -> RedisClient:
    """Get the Redis client singleton."""
    global redis_client
    if redis_client is None:
        redis_client = RedisClient(url=get_settings().redis_url)
    return redis_client


async def close_redis() -> None:
    """Close the Redis client singleton."""
    global redis_client
    if redis_client:
        await redis_client.disconnect()
        redis_client = None
