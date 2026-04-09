"""CLIP vector storage — stores CLIP vectors as named 'clip' vectors in the main collection."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
)

from openforge.common.config import get_settings
from openforge.core.pipeline.types import VectorOutput
from openforge.db.qdrant_client import get_qdrant

logger = logging.getLogger("openforge.clip_storage")


async def store_clip_vectors(
    knowledge_id: UUID,
    workspace_id: UUID,
    vectors: list[VectorOutput],
    knowledge_type: str,
) -> None:
    """Store CLIP vectors as named 'clip' vectors in openforge_knowledge collection.

    Deletes existing clip points for the given knowledge_id, then upserts new ones.
    Each vector must have dimension matching settings.clip_dimension (512).
    """
    if not vectors:
        return

    settings = get_settings()
    client = get_qdrant()
    collection = settings.qdrant_collection

    # Delete existing clip points for this knowledge
    client.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="knowledge_id",
                    match=MatchValue(value=str(knowledge_id)),
                ),
                FieldCondition(
                    key="chunk_type",
                    match=MatchValue(value="clip"),
                ),
            ]
        ),
    )

    now_str = datetime.now(timezone.utc).isoformat()
    points = []
    for i, vec in enumerate(vectors):
        if len(vec.vector) != settings.clip_dimension:
            logger.warning(
                "Skipping CLIP vector %d for knowledge %s: expected dimension %d, got %d",
                i,
                knowledge_id,
                settings.clip_dimension,
                len(vec.vector),
            )
            continue

        points.append(
            PointStruct(
                id=str(uuid4()),
                vector={"clip": vec.vector},
                payload={
                    "knowledge_id": str(knowledge_id),
                    "workspace_id": str(workspace_id),
                    "knowledge_type": knowledge_type,
                    "chunk_type": "clip",
                    "chunk_index": i,
                    "chunk_text": vec.payload.get("description", ""),
                    "timestamp_start": vec.payload.get("timestamp_start"),
                    "timestamp_end": vec.payload.get("timestamp_end"),
                    "keyframe_index": vec.payload.get("keyframe_index"),
                    "created_at": now_str,
                },
            )
        )

    if points:
        client.upsert(collection_name=collection, points=points)
        logger.info(
            "Stored %d CLIP vectors for knowledge %s in collection '%s'.",
            len(points),
            knowledge_id,
            collection,
        )
