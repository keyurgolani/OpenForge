"""Redis pub/sub listener that relays agent events to WebSocket clients."""

from __future__ import annotations

import asyncio
import json
import logging

from openforge.db.redis_client import get_redis
from openforge.api.websocket import (
    ws_manager,
    CHANNEL_AGENT,
    CHANNEL_SYSTEM,
    AGENT_EVENT_TYPES,
    SYSTEM_EVENT_TYPES,
)

logger = logging.getLogger("openforge.agent_relay")


def _classify_event(event_type: str | None) -> str | None:
    """Return the channel an event should be routed to, or None for broadcast."""
    if event_type in AGENT_EVENT_TYPES:
        return CHANNEL_AGENT
    if event_type in SYSTEM_EVENT_TYPES:
        return CHANNEL_SYSTEM
    # Unknown event type: broadcast to all channels (backward compat)
    return None


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
                execution_id = data.get("execution_id")
                event_type = data.get("type")

                # Route to execution-specific connections (ws/agent/{execution_id})
                if execution_id:
                    await ws_manager.send_to_execution(str(execution_id), data)

                # Route to workspace connections
                if workspace_id:
                    channel = _classify_event(event_type)
                    if channel:
                        # Send to the specific channel + legacy
                        await ws_manager.send_to_workspace_channel(
                            str(workspace_id), channel, data
                        )
                    else:
                        # Unknown event type: broadcast to all channels
                        await ws_manager.send_to_workspace(str(workspace_id), data)
            except Exception as e:
                logger.warning("Agent relay error: %s", e)
    except asyncio.CancelledError:
        logger.info("Agent relay shutting down")
        await pubsub.punsubscribe("agent:*")
        await pubsub.aclose()
    except Exception as e:
        logger.error("Agent relay crashed: %s", e)
