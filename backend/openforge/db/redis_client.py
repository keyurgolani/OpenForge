"""
Redis client for OpenForge v2.

Used for:
- Celery message broker and result backend
- Pub/sub for real-time agent events
- Ephemeral agent working memory
"""
import redis.asyncio as aioredis
from openforge.config import get_settings
import logging
import asyncio
import json

logger = logging.getLogger("openforge.redis")

_client: aioredis.Redis | None = None
_pubsub_listener_task: asyncio.Task | None = None


async def get_redis() -> aioredis.Redis:
    """Get or create the Redis client singleton."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info("Redis client connected.")
    return _client


async def close_redis():
    """Close the Redis client connection."""
    global _client, _pubsub_listener_task
    if _pubsub_listener_task:
        _pubsub_listener_task.cancel()
        try:
            await _pubsub_listener_task
        except asyncio.CancelledError:
            pass
        _pubsub_listener_task = None
    if _client:
        await _client.close()
        _client = None
        logger.info("Redis client disconnected.")


async def redis_event_listener():
    """
    Background task: listens to Redis pub/sub and relays to WebSocket.

    This enables Celery workers to publish events that get relayed to
    connected WebSocket clients in real-time.
    """
    from openforge.api.websocket import ws_manager

    r = await get_redis()
    pubsub = r.pubsub()

    try:
        await pubsub.subscribe("openforge:events")
        logger.info("Subscribed to openforge:events Redis channel")

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    workspace_id = data.get("workspace_id")
                    if workspace_id:
                        await ws_manager.send_to_workspace(str(workspace_id), data)
                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid JSON in Redis message: {e}")
                except Exception as e:
                    logger.error(f"Error processing Redis message: {e}")
    except asyncio.CancelledError:
        logger.info("Redis event listener cancelled")
    except Exception as e:
        logger.error(f"Redis event listener error: {e}")
    finally:
        try:
            await pubsub.unsubscribe("openforge:events")
        except Exception:
            pass


async def start_redis_listener():
    """Start the Redis pub/sub listener as a background task."""
    global _pubsub_listener_task
    if _pubsub_listener_task is None or _pubsub_listener_task.done():
        _pubsub_listener_task = asyncio.create_task(redis_event_listener())
        logger.info("Redis event listener started")


async def publish_event(event_type: str, data: dict, workspace_id: str = None):
    """
    Publish an event to the Redis pub/sub channel.

    Args:
        event_type: Type of event (e.g., 'agent_thinking', 'agent_token')
        data: Event payload
        workspace_id: Target workspace for WebSocket routing
    """
    r = await get_redis()
    message = {
        "type": event_type,
        "workspace_id": workspace_id,
        **data
    }
    await r.publish("openforge:events", json.dumps(message))
