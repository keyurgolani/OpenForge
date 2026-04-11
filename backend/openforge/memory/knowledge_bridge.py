"""Bridge between knowledge ingestion pipeline and memory system."""

import logging
from uuid import UUID

logger = logging.getLogger("openforge.memory.knowledge_bridge")


async def on_knowledge_processed(
    knowledge_id: UUID,
    workspace_id: UUID,
    chunks: list[dict],
    intelligence: dict | None = None,
    tags: list[str] | None = None,
):
    """Called after knowledge pipeline completes. Creates memories from knowledge chunks and intelligence."""
    from openforge.memory.tasks import store_memory_async_task

    # Chunk-level fact memories
    for chunk in chunks:
        chunk_text = chunk.get("text", "").strip()
        if len(chunk_text) < 50:
            continue

        store_memory_async_task.delay(
            content=chunk_text,
            source_type="system",
            memory_type="fact",
            confidence=1.0,
            tags=tags or [],
            workspace_id=str(workspace_id),
            knowledge_id=str(knowledge_id),
        )

    # Document-level synthesis from AI intelligence
    if intelligence:
        title = intelligence.get("title", "")
        summary = intelligence.get("summary", "")
        insights = intelligence.get("insights", [])

        if summary:
            synthesis_content = f"{title}\n\n{summary}"
            if insights:
                synthesis_content += "\n\nKey insights:\n" + "\n".join(f"- {i}" for i in insights)

            store_memory_async_task.delay(
                content=synthesis_content,
                source_type="system",
                memory_type="synthesis",
                confidence=1.0,
                tags=tags or [],
                workspace_id=str(workspace_id),
                knowledge_id=str(knowledge_id),
            )

    logger.info("Knowledge bridge: created memories for knowledge %s (%d chunks)", knowledge_id, len(chunks))
