"""Publish memory events to Redis pub/sub for system reminder injection."""

import json
import logging

from openforge.db.redis_client import get_redis

logger = logging.getLogger("openforge.memory.reminders")

MEMORY_EVENTS_CHANNEL = "memory:events"


async def publish_memory_event(event_type: str, data: dict) -> None:
    """Publish a memory event for potential system reminder injection.

    Event types: knowledge_extracted, contradiction_detected, entity_resolved, lesson_captured
    """
    redis = await get_redis()
    payload = json.dumps({"type": event_type, "data": data})
    try:
        await redis.publish(MEMORY_EVENTS_CHANNEL, payload)
    except Exception as e:
        logger.warning("Failed to publish memory event: %s", e)
