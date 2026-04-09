"""Pipeline dispatcher — single entry point for knowledge processing."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openforge.core.pipeline.executor import PipelineExecutor
from openforge.core.pipeline.pipeline_registry import PipelineRegistry
from openforge.core.pipeline.types import PipelineResult
from openforge.db.models import Knowledge

logger = logging.getLogger(__name__)


async def dispatch_processing(
    knowledge_id: UUID,
    workspace_id: UUID,
    knowledge_type: str,
    file_path: str,
    db_session: AsyncSession,
) -> PipelineResult:
    """Resolve pipeline, execute, update knowledge record, run embedding.

    This is the single entry point that callers use to process any knowledge
    type.  It orchestrates registry resolution, executor invocation, DB
    updates, embedding, and CLIP vector storage.
    """

    # 1. Resolve pipeline definition
    registry = PipelineRegistry()
    pipeline = await registry.get_pipeline(knowledge_type, workspace_id, db_session)

    # 2. Execute pipeline
    executor = PipelineExecutor()
    result = await executor.execute(pipeline, knowledge_id, workspace_id, file_path, db_session)

    # 3. Determine success: at least some text content or vectors produced
    has_content = bool(result.content)
    has_vectors = bool(result.vectors)

    if has_content or has_vectors:
        # Success path — update knowledge record
        await db_session.execute(
            update(Knowledge)
            .where(Knowledge.id == knowledge_id)
            .values(
                embedding_status="done",
                content=result.content,
                ai_title=result.ai_title,
                ai_summary=result.ai_summary,
                file_metadata=result.metadata or None,
                thumbnail_path=result.thumbnail_path,
            )
        )
        await db_session.commit()
    else:
        # All text-producing slots failed — mark as failed
        await db_session.execute(
            update(Knowledge)
            .where(Knowledge.id == knowledge_id)
            .values(embedding_status="failed")
        )
        await db_session.commit()
        logger.warning(
            "Pipeline produced no content and no vectors for knowledge %s", knowledge_id
        )
        return result

    # 4. Run embedding pipeline on consolidated content
    if result.content:
        from openforge.core.knowledge_processor import knowledge_processor
        from sqlalchemy import select as sa_select

        row = await db_session.execute(
            sa_select(Knowledge)
            .options(selectinload(Knowledge.tags))
            .where(Knowledge.id == knowledge_id)
        )
        knowledge_row = row.scalar_one_or_none()
        tags = [t.tag for t in knowledge_row.tags] if knowledge_row else []

        if knowledge_type == "video" and result.segments:
            # Video: use timestamp-aligned chunking instead of generic markdown splitting
            await _embed_video_chunks(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                knowledge_type=knowledge_type,
                result=result,
                title=knowledge_row.title if knowledge_row else None,
                tags=tags,
            )
        else:
            await knowledge_processor.process_knowledge(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                content=result.content,
                knowledge_type=knowledge_type,
                title=knowledge_row.title if knowledge_row else None,
                tags=tags,
                ai_summary=result.ai_summary,
            )

    # 5. Store CLIP vectors (module created in task 12.3)
    if result.vectors:
        try:
            from openforge.core.pipeline.clip_storage import store_clip_vectors

            await store_clip_vectors(knowledge_id, workspace_id, result.vectors, knowledge_type)
        except ImportError:
            logger.warning(
                "clip_storage module not yet available, skipping CLIP vector storage"
            )

    return result


async def _embed_video_chunks(
    knowledge_id: UUID,
    workspace_id: UUID,
    knowledge_type: str,
    result: PipelineResult,
    title: str | None,
    tags: list[str],
) -> None:
    """Embed video content using timestamp-aligned chunks (~30s each).

    Builds chunks from transcription segments and keyframe descriptions,
    then embeds each chunk with dense + sparse vectors in Qdrant.
    """
    from datetime import datetime, timezone
    from uuid import uuid4

    from qdrant_client.models import (
        FieldCondition,
        Filter,
        MatchValue,
        PointStruct,
        SparseVector,
    )

    from openforge.common.config import get_settings
    from openforge.common.text import normalize_knowledge_title
    from openforge.core.embedding import embed_texts, sparse_encode
    from openforge.core.pipeline.types import TranscriptionResult
    from openforge.core.pipeline.video_chunker import build_video_chunks
    from openforge.db.qdrant_client import get_qdrant

    transcription = TranscriptionResult(
        text=result.content,
        segments=result.segments,
    )

    keyframes = result.metadata.get("keyframes", [])
    frame_descriptions = result.metadata.get("frame_descriptions", [])

    chunks = build_video_chunks(transcription, keyframes, frame_descriptions)
    if not chunks:
        from openforge.core.knowledge_processor import knowledge_processor

        await knowledge_processor.process_knowledge(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            content=result.content,
            knowledge_type=knowledge_type,
            title=title,
            tags=tags,
            ai_summary=result.ai_summary,
        )
        return

    settings = get_settings()
    client = get_qdrant()
    collection = settings.qdrant_collection

    client.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="knowledge_id",
                    match=MatchValue(value=str(knowledge_id)),
                )
            ]
        ),
    )

    normalized_title = normalize_knowledge_title(title) or ""
    now_str = datetime.now(timezone.utc).isoformat()

    chunk_texts = []
    for vc in chunks:
        text = vc.transcript_text
        if vc.keyframe_descriptions:
            text += "\n\n[Visual context: " + "; ".join(vc.keyframe_descriptions) + "]"
        chunk_texts.append(text)

    embeddings = embed_texts(chunk_texts)

    points = []
    for i, (vc, embedding) in enumerate(zip(chunks, embeddings)):
        text = chunk_texts[i]
        sparse_indices, sparse_values = sparse_encode(text)
        vector: dict = {"dense": embedding}
        if sparse_indices:
            vector["sparse"] = SparseVector(
                indices=sparse_indices,
                values=sparse_values,
            )
        points.append(
            PointStruct(
                id=str(uuid4()),
                vector=vector,
                payload={
                    "knowledge_id": str(knowledge_id),
                    "workspace_id": str(workspace_id),
                    "knowledge_type": knowledge_type,
                    "chunk_index": vc.chunk_index,
                    "chunk_text": text,
                    "header_path": f"{normalized_title} @ {vc.timestamp_start:.0f}s-{vc.timestamp_end:.0f}s",
                    "parent_chunk_text": "",
                    "chunk_type": "child",
                    "timestamp_start": vc.timestamp_start,
                    "timestamp_end": vc.timestamp_end,
                    "tags": tags,
                    "title": normalized_title,
                    "created_at": now_str,
                    "updated_at": now_str,
                },
            )
        )

    if result.ai_summary and len(result.ai_summary.strip()) >= 20:
        from uuid import NAMESPACE_URL, uuid5

        from openforge.core.embedding import embed_text

        try:
            summary_embedding = embed_text(result.ai_summary)
            points.append(
                PointStruct(
                    id=str(uuid5(NAMESPACE_URL, f"summary:{knowledge_id}")),
                    vector={"summary": summary_embedding},
                    payload={
                        "knowledge_id": str(knowledge_id),
                        "workspace_id": str(workspace_id),
                        "knowledge_type": knowledge_type,
                        "chunk_index": -1,
                        "chunk_text": result.ai_summary,
                        "header_path": "",
                        "chunk_type": "summary",
                        "tags": tags,
                        "title": normalized_title,
                        "created_at": now_str,
                        "updated_at": now_str,
                    },
                )
            )
        except Exception as e:
            logger.warning("Failed to create summary vector for video %s: %s", knowledge_id, e)

    if points:
        client.upsert(collection_name=collection, points=points)
        logger.info(
            "Embedded video %s: %d timestamp-aligned chunks",
            knowledge_id,
            len(chunks),
        )
