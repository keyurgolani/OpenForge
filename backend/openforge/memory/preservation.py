"""Preserve memory context during conversation compaction."""

import logging

logger = logging.getLogger("openforge.memory.preservation")


async def preserve_on_compaction(compacted_summary: str | None, conversation_id: str) -> str:
    """Store compaction summary as context memory and return L1 manifest for re-injection."""
    if compacted_summary:
        try:
            from openforge.memory.tasks import store_memory_async_task

            store_memory_async_task.delay(
                content=compacted_summary,
                source_type="system",
                memory_type="context",
                confidence=0.9,
                tags=["compaction-summary"],
                source_conversation_id=conversation_id,
            )
        except Exception as e:
            logger.warning("Failed to store compaction summary: %s", e)

    # Return L1 manifest for re-injection
    try:
        from openforge.memory.manifest import get_l1_manifest_text

        manifest = await get_l1_manifest_text()
        if manifest.strip():
            return f"\n[Memory context restored after compaction]\n{manifest}"
    except Exception:
        pass

    return ""
