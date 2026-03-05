from openforge.core.embedding import embed_text
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings
from openforge.utils.title import normalize_note_title
from qdrant_client.models import Filter, FieldCondition, MatchValue
from typing import Optional
import logging

logger = logging.getLogger("openforge.search")


class SearchEngine:
    def search(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        note_type: Optional[str] = None,
        tag: Optional[str] = None,
        score_threshold: float = 0.3,
    ) -> list[dict]:
        """Semantic search within a workspace."""
        try:
            query_vector = embed_text(query)
        except Exception as e:
            logger.warning(f"Embedding failed for search query: {e}")
            return []

        must_conditions = [
            FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id))
        ]
        if note_type:
            must_conditions.append(
                FieldCondition(key="note_type", match=MatchValue(value=note_type))
            )
        if tag:
            must_conditions.append(
                FieldCondition(key="tags", match=MatchValue(value=tag))
            )

        settings = get_settings()
        client = get_qdrant()

        try:
            results = client.search(
                collection_name=settings.qdrant_collection,
                query_vector=query_vector,
                query_filter=Filter(must=must_conditions),
                limit=limit,
                with_payload=True,
                score_threshold=score_threshold,
            )
        except Exception as e:
            logger.error(f"Qdrant search failed: {e}")
            return []

        return [
            {
                "note_id": hit.payload["note_id"],
                "title": normalize_note_title(hit.payload.get("title")) or "",
                "note_type": hit.payload.get("note_type", "standard"),
                "chunk_text": hit.payload.get("chunk_text", ""),
                "header_path": hit.payload.get("header_path", ""),
                "tags": hit.payload.get("tags", []),
                "score": hit.score,
                "created_at": hit.payload.get("created_at", ""),
            }
            for hit in results
        ]

    def search_deduplicated(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        note_type: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[dict]:
        """Search and deduplicate: keep highest-scoring chunk per note."""
        raw = self.search(query, workspace_id, limit * 3, note_type, tag)
        seen: dict[str, dict] = {}
        for r in raw:
            note_id = r["note_id"]
            if note_id not in seen or r["score"] > seen[note_id]["score"]:
                seen[note_id] = r
        return sorted(seen.values(), key=lambda x: x["score"], reverse=True)[:limit]


search_engine = SearchEngine()
