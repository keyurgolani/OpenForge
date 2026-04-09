from openforge.core.embedding import embed_text, sparse_encode
from openforge.db.qdrant_client import get_qdrant
from openforge.common.config import get_settings
from openforge.common.text import normalize_knowledge_title
from pathlib import Path
from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
    Prefetch,
    FusionQuery,
    Fusion,
    SparseVector,
)
from typing import Any, Optional
import logging

logger = logging.getLogger("openforge.search")

SEARCH_RERANKING_KEY = "search.reranking_enabled"

# In-memory override for reranking setting (set on startup and via settings API)
_reranking_enabled_override: bool | None = None


def set_reranking_enabled(value: bool | None):
    """Update the in-memory reranking enabled flag (called from settings API and startup)."""
    global _reranking_enabled_override
    _reranking_enabled_override = value


def is_reranking_enabled() -> bool:
    """Check if cross-encoder reranking is enabled. Uses in-memory override if set, else env default."""
    if _reranking_enabled_override is not None:
        return _reranking_enabled_override
    return get_settings().search_reranking_enabled


# Lazy-loaded cross-encoder reranker
_reranker = None


def get_reranker():
    """Load cross-encoder model lazily on first use."""
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder

        settings = get_settings()
        cache_dir = str(Path(settings.models_root) / "cross-encoder")
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        logger.info("Loading cross-encoder reranking model: cross-encoder/ms-marco-MiniLM-L-6-v2")
        _reranker = CrossEncoder(
            "cross-encoder/ms-marco-MiniLM-L-6-v2",
            automodel_args={"cache_dir": cache_dir},
            tokenizer_args={"cache_dir": cache_dir},
        )
        logger.info("Cross-encoder reranking model loaded.")
    return _reranker


def rerank_results(query: str, candidates: list, limit: int) -> list:
    """Rerank search candidates using a cross-encoder model.

    Takes (query, candidate_points) and returns the top `limit` candidates
    re-sorted by cross-encoder relevance score.
    """
    if not candidates:
        return []

    reranker = get_reranker()
    pairs = []
    for hit in candidates:
        chunk_text = (hit.payload or {}).get("chunk_text", "")
        pairs.append((query, chunk_text))

    scores = reranker.predict(pairs)
    ranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
    return [hit for hit, _ in ranked[:limit]]


class SearchEngine:
    def search(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        knowledge_type: Optional[str] = None,
        tag: Optional[str] = None,
        score_threshold: float = 0.0,
        expand_context: bool = False,
        search_mode: str = "text",
        query_image: Any = None,
    ) -> list[dict]:
        """Search with optional visual mode using CLIP vectors.

        search_mode:
            "text"   — dense + sparse + summary → RRF → cross-encoder rerank (default)
            "visual" — encode query_image with CLIP, search clip named vector
            "hybrid" — fuse text results and visual results via Reciprocal Rank Fusion
        """
        if search_mode == "visual":
            if query_image is None:
                raise ValueError("query_image is required for visual search mode")
            return self._visual_search(
                query_image=query_image,
                workspace_id=workspace_id,
                limit=limit,
                expand_context=expand_context,
            )

        if search_mode == "hybrid":
            text_results = self._text_search(
                query=query,
                workspace_id=workspace_id,
                limit=limit,
                knowledge_type=knowledge_type,
                tag=tag,
                score_threshold=score_threshold,
                expand_context=expand_context,
            )
            visual_results = (
                self._visual_search(
                    query_image=query_image,
                    workspace_id=workspace_id,
                    limit=limit,
                    expand_context=expand_context,
                )
                if query_image is not None
                else []
            )
            return _rrf_fuse(text_results, visual_results)[:limit]

        # Default: text mode
        return self._text_search(
            query=query,
            workspace_id=workspace_id,
            limit=limit,
            knowledge_type=knowledge_type,
            tag=tag,
            score_threshold=score_threshold,
            expand_context=expand_context,
        )

    # ------------------------------------------------------------------
    # Internal: text search (original 4-representation logic)
    # ------------------------------------------------------------------

    def _text_search(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        knowledge_type: Optional[str] = None,
        tag: Optional[str] = None,
        score_threshold: float = 0.0,
        expand_context: bool = False,
    ) -> list[dict]:
        """4-representation search: dense + sparse + summary → RRF → cross-encoder rerank."""
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

        # Build prefetch list: dense + sparse + summary
        prefetches = [
            Prefetch(
                query=dense_vector,
                using="dense",
                limit=limit * 3,
                filter=search_filter,
            ),
        ]

        if sparse_indices:
            prefetches.append(
                Prefetch(
                    query=SparseVector(
                        indices=sparse_indices,
                        values=sparse_values,
                    ),
                    using="sparse",
                    limit=limit * 3,
                    filter=search_filter,
                ),
            )

        # Summary vector prefetch — uses the same dense embedding to query
        # against summary representations for document-level matching
        prefetches.append(
            Prefetch(
                query=dense_vector,
                using="summary",
                limit=limit * 2,
                filter=search_filter,
            ),
        )

        # RRF fusion across all representations → top 50 candidates for reranking
        rerank_pool = 50 if is_reranking_enabled() else limit
        try:
            results = client.query_points(
                collection_name=settings.qdrant_collection,
                prefetch=prefetches,
                query=FusionQuery(fusion=Fusion.RRF),
                limit=rerank_pool,
                with_payload=True,
            )

            candidates = results.points

            # Cross-encoder reranking of top candidates
            if is_reranking_enabled() and len(candidates) > 0:
                try:
                    candidates = rerank_results(query, candidates, limit)
                except Exception as e:
                    logger.warning("Cross-encoder reranking failed, using RRF order: %s", e)
                    candidates = candidates[:limit]
            else:
                candidates = candidates[:limit]

            return [self._format_result(hit, include_parent=expand_context) for hit in candidates]
        except Exception as e:
            logger.warning("4-rep search failed, falling back to dense-only: %s", e)

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
            return [self._format_result(hit, include_parent=expand_context) for hit in results]
        except Exception as e:
            logger.error("Qdrant search failed: %s", e)
            return []

    # ------------------------------------------------------------------
    # Internal: visual search (CLIP named vector)
    # ------------------------------------------------------------------

    def _visual_search(
        self,
        query_image: Any,
        workspace_id: str,
        limit: int = 20,
        expand_context: bool = False,
    ) -> list[dict]:
        """Search the clip named vector using a CLIP-encoded query image."""
        try:
            import asyncio

            from openforge.core.pipeline.backends.clip_backend import CLIPBackend

            # CLIPBackend._get_clip_model is async — run it in the current or new loop
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                import concurrent.futures

                with concurrent.futures.ThreadPoolExecutor() as pool:
                    clip_model = loop.run_in_executor(
                        pool, lambda: asyncio.run(CLIPBackend._get_clip_model())
                    )
                    # We can't await here (sync method), so use a nested event loop via thread
                    import threading

                    result_holder: list = []
                    exc_holder: list = []

                    def _load():
                        try:
                            result_holder.append(asyncio.run(CLIPBackend._get_clip_model()))
                        except Exception as e:
                            exc_holder.append(e)

                    t = threading.Thread(target=_load)
                    t.start()
                    t.join(timeout=60)
                    if exc_holder:
                        raise exc_holder[0]
                    clip_model = result_holder[0] if result_holder else None
            else:
                clip_model = asyncio.run(CLIPBackend._get_clip_model())

            if clip_model is None:
                logger.error("CLIP model not available for visual search")
                return []

            from PIL import Image as PILImage

            img = query_image
            if not isinstance(img, PILImage.Image):
                logger.error("query_image must be a PIL Image instance")
                return []
            if img.mode != "RGB":
                img = img.convert("RGB")

            query_embedding = clip_model.encode(img, normalize_embeddings=True).tolist()
        except Exception as e:
            logger.error("CLIP encoding failed for visual search: %s", e)
            return []

        settings = get_settings()
        client = get_qdrant()

        search_filter = Filter(
            must=[
                FieldCondition(
                    key="workspace_id",
                    match=MatchValue(value=workspace_id),
                ),
                FieldCondition(
                    key="chunk_type",
                    match=MatchValue(value="clip"),
                ),
            ]
        )

        try:
            results = client.search(
                collection_name=settings.qdrant_collection,
                query_vector=("clip", query_embedding),
                query_filter=search_filter,
                limit=limit,
                with_payload=True,
            )
            return [self._format_result(hit, include_parent=expand_context) for hit in results]
        except Exception as e:
            logger.error("Visual search failed: %s", e)
            return []

    def _format_result(self, hit, include_parent: bool = False) -> dict:
        payload = hit.payload or {}
        result = {
            "knowledge_id": payload.get("knowledge_id"),
            "conversation_id": payload.get("conversation_id"),
            "title": normalize_knowledge_title(payload.get("title")) or "",
            "knowledge_type": payload.get("knowledge_type", "note"),
            "chunk_text": payload.get("chunk_text", ""),
            "header_path": payload.get("header_path", ""),
            "tags": payload.get("tags", []),
            "score": hit.score,
            "created_at": payload.get("created_at", ""),
            "chunk_type": payload.get("chunk_type"),
            "char_start": payload.get("char_start"),
            "char_end": payload.get("char_end"),
            "token_count": payload.get("token_count"),
            "parent_token_count": payload.get("parent_token_count"),
        }
        if include_parent:
            result["parent_chunk_text"] = payload.get("parent_chunk_text") or None
        return result

    def search_deduplicated(
        self,
        query: str,
        workspace_id: str,
        limit: int = 20,
        knowledge_type: Optional[str] = None,
        tag: Optional[str] = None,
        expand_context: bool = False,
        search_mode: str = "text",
        query_image: Any = None,
    ) -> list[dict]:
        """Search and deduplicate: keep highest-scoring result per knowledge item or conversation."""
        raw = self.search(
            query, workspace_id, limit * 3, knowledge_type, tag,
            expand_context=expand_context, search_mode=search_mode,
            query_image=query_image,
        )
        seen: dict[str, dict] = {}
        for r in raw:
            # Use conversation_id for chat results, knowledge_id for knowledge items
            key = r.get("conversation_id") or r.get("knowledge_id")
            if not key:
                continue
            if key not in seen or r["score"] > seen[key]["score"]:
                seen[key] = r
        return sorted(seen.values(), key=lambda x: x["score"], reverse=True)[:limit]


def _rrf_fuse(
    text_results: list[dict],
    visual_results: list[dict],
    k: int = 60,
) -> list[dict]:
    """Fuse two ranked result lists via Reciprocal Rank Fusion.

    RRF score for each result = sum(1 / (k + rank_i)) across all lists
    where rank_i is the 1-based rank in list i.
    """
    scores: dict[str, float] = {}
    results_map: dict[str, dict] = {}

    for rank, r in enumerate(text_results):
        kid = r["knowledge_id"]
        scores[kid] = scores.get(kid, 0) + 1 / (k + rank + 1)
        results_map[kid] = r

    for rank, r in enumerate(visual_results):
        kid = r["knowledge_id"]
        scores[kid] = scores.get(kid, 0) + 1 / (k + rank + 1)
        if kid not in results_map:
            results_map[kid] = r

    fused = sorted(
        results_map.values(),
        key=lambda r: scores[r["knowledge_id"]],
        reverse=True,
    )
    return fused


search_engine = SearchEngine()
