"""L1 manifest — the essential memory context injected into every agent preamble.

The manifest is a short text block (max 3 200 chars) listing the most-recalled
memories grouped by workspace.  It is rebuilt periodically by background daemons
and cached in Redis so the sync ``build_preamble`` path can read it without
awaiting.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from openforge.db.redis_client import get_redis

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

REDIS_KEY = "memory:l1_manifest"
_TTL_SECONDS = 3600  # 1 hour

MAX_CHARS = 3200


async def get_l1_manifest_text() -> str:
    """Return the cached L1 manifest string, or empty string if not yet built."""
    redis = await get_redis()
    cached = await redis.get(REDIS_KEY)
    if cached is None:
        return ""
    return cached if isinstance(cached, str) else cached.decode("utf-8")


async def rebuild_l1_manifest(db: AsyncSession) -> str:
    """Rebuild the L1 manifest from the database and cache in Redis.

    Fetches the top memories via ``MemoryService.get_l1_manifest()``, formats
    them grouped by workspace, hard-caps the result at 3 200 characters, and
    stores the text in Redis with a 1-hour TTL.
    """
    from openforge.domains.memory.service import MemoryService

    svc = MemoryService(db)
    memories = await svc.get_l1_manifest(limit=10)

    if not memories:
        text = ""
        redis = await get_redis()
        await redis.set(REDIS_KEY, text, ex=_TTL_SECONDS)
        return text

    # Group by workspace_id
    groups: dict[str | None, list[dict]] = {}
    for m in memories:
        ws = m.get("workspace_id")
        groups.setdefault(ws, []).append(m)

    lines: list[str] = []
    for ws_id, mems in groups.items():
        header = f"Workspace {ws_id}:" if ws_id else "General:"
        lines.append(header)
        for m in mems:
            mtype = m.get("memory_type", "note")
            content = (m.get("content") or "").replace("\n", " ").strip()
            lines.append(f"- [{mtype}] {content}")
        lines.append("")  # blank separator between groups

    text = "\n".join(lines).strip()

    # Hard cap
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS].rsplit("\n", 1)[0]

    redis = await get_redis()
    await redis.set(REDIS_KEY, text, ex=_TTL_SECONDS)
    return text
