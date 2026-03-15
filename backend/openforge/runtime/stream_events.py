"""Runtime event relay helpers."""

from __future__ import annotations

import asyncio
import json
import logging

from openforge.api.websocket import ws_manager
from openforge.db.redis_client import get_redis

logger = logging.getLogger("openforge.runtime.stream_events")


async def start_agent_relay() -> None:
    """Bridge Redis-published agent events to workspace WebSocket channels."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.psubscribe("agent:*")
    await pubsub.psubscribe("runtime:*")
    logger.info("Runtime stream relay started on agent:* and runtime:*")

    try:
        async for message in pubsub.listen():
            if message["type"] != "pmessage":
                continue
            try:
                data = json.loads(message["data"])
                workspace_id = data.get("workspace_id")
                if workspace_id:
                    await ws_manager.send_to_workspace(str(workspace_id), data)
            except Exception as exc:  # pragma: no cover - defensive relay logging
                logger.warning("Runtime stream relay error: %s", exc)
    except asyncio.CancelledError:
        logger.info("Runtime stream relay stopping")
        await pubsub.punsubscribe("agent:*")
        await pubsub.punsubscribe("runtime:*")
        await pubsub.aclose()
        raise
