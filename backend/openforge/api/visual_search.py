"""
Visual Search API — Image-to-Image search using CLIP embeddings.
"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from typing import Optional
import logging

from openforge.db.postgres import get_db
from openforge.db.models import Knowledge
from openforge.common.config import get_settings

router = APIRouter()
logger = logging.getLogger("openforge.visual_search")


@router.post("/{workspace_id}/knowledge/search/visual")
async def visual_search(
    workspace_id: UUID,
    file: UploadFile = File(...),
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Search for visually similar images using CLIP embeddings."""
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Only image files are supported for visual search.",
        )

    # Read image
    image_data = await file.read()
    if len(image_data) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image too large for visual search. Maximum 20MB.",
        )

    try:
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(image_data))
        if img.mode != "RGB":
            img = img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to open image: {e}")

    # Encode with CLIP
    try:
        from openforge.core.pipeline.backends.clip_backend import CLIPBackend

        clip_model = await CLIPBackend._get_clip_model()
        query_embedding = clip_model.encode(img, normalize_embeddings=True).tolist()
    except Exception as e:
        logger.error("CLIP encoding failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Visual search model not available. Please ensure the CLIP model is loaded.",
        )

    # Search clip named vector in main openforge_knowledge collection
    settings = get_settings()
    from openforge.db.qdrant_client import get_qdrant
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    client = get_qdrant()
    collection = settings.qdrant_collection

    try:
        results = client.search(
            collection_name=collection,
            query_vector=("clip", query_embedding),
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="workspace_id",
                        match=MatchValue(value=str(workspace_id)),
                    ),
                    FieldCondition(
                        key="chunk_type",
                        match=MatchValue(value="clip"),
                    ),
                ]
            ),
            limit=limit,
            with_payload=True,
        )
    except Exception as e:
        logger.error("Visual search failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Visual search failed: {e}")

    # Enrich results with knowledge data
    enriched_results = []
    for hit in results:
        payload = hit.payload or {}
        knowledge_id = payload.get("knowledge_id")

        if not knowledge_id:
            continue

        # Fetch knowledge record for title/thumbnail
        knowledge_result = await db.execute(
            select(Knowledge).where(Knowledge.id == UUID(knowledge_id))
        )
        knowledge = knowledge_result.scalar_one_or_none()

        enriched_results.append({
            "knowledge_id": knowledge_id,
            "score": hit.score,
            "title": knowledge.title if knowledge else "",
            "ai_title": knowledge.ai_title if knowledge else "",
            "thumbnail_path": knowledge.thumbnail_path if knowledge else None,
            "mime_type": knowledge.mime_type if knowledge else None,
            "file_size": knowledge.file_size if knowledge else None,
            "created_at": payload.get("created_at", ""),
        })

    return {
        "results": enriched_results,
        "total": len(enriched_results),
    }
