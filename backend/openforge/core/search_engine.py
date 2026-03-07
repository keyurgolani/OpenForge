from openforge.core.embedding import embed_text, sparse_encode
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings
from openforge.utils.title import normalize_knowledge_title
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue, Prefetch, Fusion, SparseVector
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
        score_threshold: float = 0.3,
        use_hybrid: bool = True,
    ) -> list[dict]:
        """
        Search within a workspace using hybrid search (dense + sparse).

        Args:
            query: The search query
            workspace_id: Workspace to search within
            limit: Maximum number of results
            knowledge_type: Filter by knowledge type
            tag: Filter by tag
            score_threshold: Minimum score threshold
            use_hybrid: Use hybrid search (dense + sparse with RRF fusion)

        Returns:
            List of search results with knowledge metadata
        """
        try:
            query_vector = embed_text(query)
            query_sparse = sparse_encode(query)
        except Exception as e:
            logger.warning(f"Embedding failed for search query: {e}")
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
        query_filter = Filter(must=must_conditions)

        try:
            if use_hybrid and query_sparse.indices:
                # Hybrid search: use RRF fusion to combine dense and sparse results
                results = client.query_points(
                    collection_name=settings.qdrant_collection,
                    query=query_vector,  # Dense vector query
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                    score_threshold=score_threshold,
                    prefetch=[
                        # Dense vector prefetch
                        Prefetch(
                            query=query_vector,
                            using="",  # Default dense vector
                            filter=query_filter,
                            limit=limit * 2,
                        ),
                        # Sparse vector prefetch (BM25)
                        Prefetch(
                            query=query_sparse,
                            using="sparse",  # Named sparse vector
                            filter=query_filter,
                            limit=limit * 2,
                        ),
                    ],
                    query_fusion=Fusion.RRF,  # Reciprocal Rank Fusion
                ).points
            else:
                # Fallback to dense-only search (for legacy data or sparse encode failure)
                results = client.search(
                    collection_name=settings.qdrant_collection,
                    query_vector=query_vector,
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                    score_threshold=score_threshold,
                )
        except Exception as e:
            logger.error(f"Qdrant search failed: {e}")
            # Try fallback to dense-only search
            try:
                results = client.search(
                    collection_name=settings.qdrant_collection,
                    query_vector=query_vector,
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                    score_threshold=score_threshold,
                )
            except Exception as e2:
                logger.error(f"Dense-only fallback search also failed: {e2}")
                return []

        return [
            {
                "knowledge_id": hit.payload["knowledge_id"],
                "title": normalize_knowledge_title(hit.payload.get("title")) or "",
                "knowledge_type": hit.payload.get("knowledge_type", "standard"),
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
        knowledge_type: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[dict]:
        """Search and deduplicate: keep highest-scoring chunk per knowledge item."""
        raw = self.search(query, workspace_id, limit * 3, knowledge_type, tag)
        seen: dict[str, dict] = {}
        for r in raw:
            knowledge_id = r["knowledge_id"]
            if knowledge_id not in seen or r["score"] > seen[knowledge_id]["score"]:
                seen[knowledge_id] = r
        return sorted(seen.values(), key=lambda x: x["score"], reverse=True)[:limit]


search_engine = SearchEngine()
