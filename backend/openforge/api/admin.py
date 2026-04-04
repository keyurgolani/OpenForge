"""Admin API endpoints for operational metrics and dashboarding."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Query

logger = logging.getLogger("openforge.admin")

router = APIRouter()


@router.get("/tool-analytics")
async def get_tool_analytics(
    limit: int = Query(default=100, ge=1, le=1000),
    tool_id: Optional[str] = None,
    agent_slug: Optional[str] = None,
):
    """Retrieve recent tool usage analytics from Redis.

    Returns the most recent entries, optionally filtered by tool_id or agent_slug.
    """
    try:
        import redis.asyncio as aioredis
        from openforge.common.config import get_settings

        settings = get_settings()
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        # Fetch more than limit to allow for filtering
        fetch_count = limit * 3 if (tool_id or agent_slug) else limit
        raw_entries = await r.lrange("openforge:tool_analytics", 0, fetch_count - 1)
        await r.aclose()

        entries = []
        for raw in raw_entries:
            try:
                entry = json.loads(raw)
                if tool_id and entry.get("tool_id") != tool_id:
                    continue
                if agent_slug and entry.get("agent_slug") != agent_slug:
                    continue
                entries.append(entry)
                if len(entries) >= limit:
                    break
            except json.JSONDecodeError:
                continue

        return {"entries": entries, "total": len(entries)}

    except Exception as exc:
        logger.warning("Failed to fetch tool analytics: %s", exc)
        return {"entries": [], "total": 0, "error": str(exc)}
