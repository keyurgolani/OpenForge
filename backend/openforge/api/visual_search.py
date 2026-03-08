"""Image-to-image visual search endpoint."""
from fastapi import APIRouter, UploadFile, HTTPException, File
from uuid import UUID
import logging
import io

logger = logging.getLogger("openforge.visual_search")
router = APIRouter()


@router.post("/{wid}/knowledge/search/visual")
async def visual_search(wid: UUID, file: UploadFile = File(...)):
    """Search for visually similar images using CLIP embeddings."""
    try:
        from PIL import Image
        from openforge.core.knowledge_processors.image_processor import get_clip_model
        from openforge.db.qdrant_client import get_qdrant
        from openforge.config import get_settings

        settings = get_settings()

        clip_model = get_clip_model()
        if not clip_model:
            raise HTTPException(503, "CLIP model not available. Visual search is not configured.")

        # Read and process the uploaded image
        image_bytes = await file.read()
        img = Image.open(io.BytesIO(image_bytes))

        # Generate CLIP embedding
        embedding = clip_model.encode(img, normalize_embeddings=True)

        # Search visual collection
        client = get_qdrant()
        collection = f"{settings.qdrant_collection}_visual"

        # Check if collection exists
        collections = [c.name for c in client.get_collections().collections]
        if collection not in collections:
            return {"results": [], "message": "No visual knowledge indexed yet"}

        from qdrant_client.models import Filter, FieldCondition, MatchValue

        results = client.search(
            collection_name=collection,
            query_vector=embedding.tolist(),
            query_filter=Filter(
                must=[FieldCondition(key="workspace_id", match=MatchValue(value=str(wid)))]
            ),
            limit=20,
            with_payload=True,
        )

        return {
            "results": [
                {
                    "knowledge_id": r.payload.get("knowledge_id"),
                    "score": r.score,
                    "thumbnail_path": r.payload.get("thumbnail_path"),
                }
                for r in results
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Visual search failed: {e}")
        raise HTTPException(500, f"Visual search failed: {str(e)}")
