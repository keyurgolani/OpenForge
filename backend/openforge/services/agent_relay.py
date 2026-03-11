"""Redis pub/sub listener that relays agent events to WebSocket clients."""

from __future__ import annotations

import asyncio
import json
import logging

from openforge.db.redis_client import get_redis
from openforge.api.websocket import ws_manager

logger = logging.getLogger("openforge.agent_relay")


async def start_agent_relay() -> None:
    """Subscribe to agent:* channels and relay events to WebSocket."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.psubscribe("agent:*")
    logger.info("Agent relay started — listening on agent:* channels")

    try:
        async for message in pubsub.listen():
            if message["type"] != "pmessage":
                continue
            try:
                data = json.loads(message["data"])
                workspace_id = data.get("workspace_id")
                if workspace_id:
                    await ws_manager.send_to_workspace(str(workspace_id), data)
            except Exception as e:
                logger.warning("Agent relay error: %s", e)
    except asyncio.CancelledError:
        logger.info("Agent relay shutting down")
        await pubsub.punsubscribe("agent:*")
        await pubsub.aclose()
    except Exception as e:
        logger.error("Agent relay crashed: %s", e)
