from openforge.core.embedding import embed_text, sparse_encode
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings
from openforge.utils.title import normalize_knowledge_title
from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
    Prefetch,
    FusionQuery,
    Fusion,
    SparseVector,
)
from typing import Optional
import logging

logger = logging.getLogger("openforge.search")


class SearchEngine:
    def search(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        knowledge_type: Optional[str] = None,
        tag: Optional[str] = None,
        score_threshold: float = 0.0,
    ) -> list[dict]:
        """Hybrid BM25 + semantic search within a workspace using Qdrant RRF fusion."""
        try:
            dense_vector = embed_text(query)
            sparse_indices, sparse_values = sparse_encode(query)
        except Exception as e:
            logger.warning("Embedding failed for search query: %s", e)
            return []

        must_conditions = [
            FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id))
        ]
        if knowledge_type:
            must_conditions.append(
                FieldCondition(key="knowledge_type", match=MatchValue(value=knowledge_type))
            )
        if tag:
            must_conditions.append(
                FieldCondition(key="tags", match=MatchValue(value=tag))
            )

        settings = get_settings()
        client = get_qdrant()
        search_filter = Filter(must=must_conditions)

        # Hybrid search: dense + sparse with RRF fusion
        if sparse_indices:
            try:
                results = client.query_points(
                    collection_name=settings.qdrant_collection,
                    prefetch=[
                        Prefetch(
                            query=dense_vector,
                            using="dense",
                            limit=limit * 2,
                            filter=search_filter,
                        ),
                        Prefetch(
                            query=SparseVector(
                                indices=sparse_indices,
                                values=sparse_values,
                            ),
                            using="sparse",
                            limit=limit * 2,
                            filter=search_filter,
                        ),
                    ],
                    query=FusionQuery(fusion=Fusion.RRF),
                    limit=limit,
                    with_payload=True,
                )
                return [self._format_result(hit) for hit in results.points]
            except Exception as e:
                logger.warning("Hybrid search failed, falling back to dense-only: %s", e)

        # Dense-only fallback (named vector)
        try:
            results = client.search(
                collection_name=settings.qdrant_collection,
                query_vector=("dense", dense_vector),
                query_filter=search_filter,
                limit=limit,
                with_payload=True,
                score_threshold=score_threshold,
            )
            return [self._format_result(hit) for hit in results]
        except Exception as e:
            logger.error("Qdrant search failed: %s", e)
            return []

    def _format_result(self, hit) -> dict:
        payload = hit.payload or {}
        return {
            "knowledge_id": payload.get("knowledge_id"),
            "conversation_id": payload.get("conversation_id"),
            "title": normalize_knowledge_title(payload.get("title")) or "",
            "knowledge_type": payload.get("knowledge_type", "standard"),
            "chunk_text": payload.get("chunk_text", ""),
            "header_path": payload.get("header_path", ""),
            "tags": payload.get("tags", []),
            "score": hit.score,
            "created_at": payload.get("created_at", ""),
        }

    def search_deduplicated(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        knowledge_type: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[dict]:
        """Search and deduplicate: keep highest-scoring result per knowledge item or conversation."""
        raw = self.search(query, workspace_id, limit * 3, knowledge_type, tag)
        seen: dict[str, dict] = {}
        for r in raw:
            # Use conversation_id for chat results, knowledge_id for knowledge items
            key = r.get("conversation_id") or r.get("knowledge_id")
            if not key:
                continue
            if key not in seen or r["score"] > seen[key]["score"]:
                seen[key] = r
        return sorted(seen.values(), key=lambda x: x["score"], reverse=True)[:limit]


search_engine = SearchEngine()
