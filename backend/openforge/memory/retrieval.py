"""Multi-backend fusion retrieval for the memory system.

Queries Qdrant (vector), PostgreSQL (full-text), and Neo4j (graph) in
parallel, fuses results via Reciprocal Rank Fusion (RRF), applies a
recency boost, and cuts off at the relevance cliff.
"""

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.embedding import embed_text
from openforge.db.models import MemoryModel
from openforge.db.qdrant_client import get_qdrant
from openforge.domains.memory.service import MemoryService
from openforge.memory.graph_search import search_graph
from qdrant_client.models import Filter, FieldCondition, MatchValue

logger = logging.getLogger("openforge.memory.retrieval")

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _rrf_score(rank: int) -> float:
    """Reciprocal Rank Fusion score with constant K=60."""
    return 1.0 / (60 + rank + 1)


def _recency_boost(observed_at_str: str | None, half_life_days: float = 30) -> float:
    """Exponential decay boost based on memory age.

    Returns a value in (0, 1] where 1 means "just observed" and 0.5 means
    the memory is *half_life_days* old.  Returns 0.5 on any parse error.
    """
    if not observed_at_str:
        return 0.5
    try:
        observed = datetime.fromisoformat(observed_at_str)
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - observed).total_seconds() / 86400
        return math.exp(-0.693 * age_days / half_life_days)
    except Exception:
        return 0.5


def _apply_relevance_cliff(
    results: list[dict],
    gap_threshold: float = 0.30,
) -> list[dict]:
    """Drop results after a relative score gap exceeds *gap_threshold*.

    Also stops if the absolute score drops below 0.01.
    """
    if not results:
        return results

    filtered = [results[0]]
    for i in range(1, len(results)):
        prev_score = results[i - 1]["score"]
        cur_score = results[i]["score"]
        if cur_score < 0.01:
            break
        if prev_score > 0:
            relative_gap = (prev_score - cur_score) / prev_score
            if relative_gap > gap_threshold:
                break
        filtered.append(results[i])
    return filtered


# ---------------------------------------------------------------------------
# Backend search functions
# ---------------------------------------------------------------------------


async def _search_qdrant(
    query: str,
    workspace_id: UUID | None = None,
    memory_type: str | None = None,
    tags: list[str] | None = None,
    limit: int = 20,
) -> list[dict]:
    """Embed the query and search the ``openforge_memory`` collection."""
    try:
        vector = embed_text(query)
        qdrant = get_qdrant()

        must_conditions = [
            FieldCondition(key="invalidated", match=MatchValue(value=False)),
        ]
        if workspace_id:
            must_conditions.append(
                FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id)))
            )
        if memory_type:
            must_conditions.append(
                FieldCondition(key="memory_type", match=MatchValue(value=memory_type))
            )
        if tags:
            for tag in tags:
                must_conditions.append(
                    FieldCondition(key="tags", match=MatchValue(value=tag))
                )

        hits = qdrant.search(
            collection_name="openforge_memory",
            query_vector=vector,
            query_filter=Filter(must=must_conditions),
            limit=limit,
            with_payload=True,
        )

        return [
            {
                "id": h.payload.get("memory_id", str(h.id)),
                "score": h.score,
                "memory_type": h.payload.get("memory_type"),
                "observed_at": h.payload.get("observed_at"),
                "workspace_id": h.payload.get("workspace_id"),
                "tags": h.payload.get("tags", []),
                "source": "vector",
            }
            for h in hits
        ]
    except Exception as e:
        logger.warning("Qdrant search failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Main recall entry-point
# ---------------------------------------------------------------------------


async def recall(
    query: str,
    db: AsyncSession,
    workspace_id: UUID | None = None,
    memory_type: str | None = None,
    tags: list[str] | None = None,
    deep: bool = False,
    limit: int = 10,
) -> list[dict]:
    """Run multi-backend fusion retrieval and return the top *limit* results.

    Backends queried in parallel:
    1. Qdrant vector search
    2. PostgreSQL full-text search
    3. Neo4j graph traversal

    Results are fused with RRF, boosted by recency, cliff-detected, then
    enriched with full content from PostgreSQL.
    """
    service = MemoryService(db)
    fetch_limit = limit * 3

    # --- parallel backend queries -------------------------------------------

    async def _safe_graph():
        try:
            return await search_graph(query, depth=4 if deep else 2, limit=fetch_limit)
        except Exception as e:
            logger.warning("Neo4j graph search unavailable: %s", e)
            return []

    qdrant_task = _search_qdrant(
        query,
        workspace_id=workspace_id if not deep else None,
        memory_type=memory_type,
        tags=tags,
        limit=fetch_limit,
    )
    fulltext_task = service.recall_fulltext(
        query=query,
        workspace_id=workspace_id,
        memory_type=memory_type,
        limit=fetch_limit,
    )
    graph_task = _safe_graph()

    backend_results = await asyncio.gather(
        qdrant_task, fulltext_task, graph_task, return_exceptions=True,
    )

    # Collect results, skipping failed backends
    all_results: list[list[dict]] = []
    for idx, res in enumerate(backend_results):
        if isinstance(res, BaseException):
            backend_name = ["qdrant", "fulltext", "graph"][idx]
            logger.warning("Backend %s failed: %s", backend_name, res)
            all_results.append([])
        else:
            all_results.append(res)

    # --- RRF fusion ---------------------------------------------------------

    fused_scores: dict[str, float] = {}
    observed_at_map: dict[str, str | None] = {}

    for result_set in all_results:
        for rank, item in enumerate(result_set):
            mid = str(item.get("id", ""))
            if not mid:
                continue
            fused_scores[mid] = fused_scores.get(mid, 0.0) + _rrf_score(rank)
            # Keep the most recent observed_at we see
            if mid not in observed_at_map:
                observed_at_map[mid] = item.get("observed_at")

    # --- recency boost ------------------------------------------------------

    for mid in fused_scores:
        boost = _recency_boost(observed_at_map.get(mid))
        fused_scores[mid] = fused_scores[mid] * (0.7 + 0.3 * boost)

    # --- sort and cliff detection -------------------------------------------

    sorted_ids = sorted(fused_scores, key=lambda m: fused_scores[m], reverse=True)
    scored_list = [{"id": mid, "score": fused_scores[mid]} for mid in sorted_ids]
    scored_list = _apply_relevance_cliff(scored_list)

    # Trim to requested limit
    scored_list = scored_list[:limit]
    if not scored_list:
        return []

    # --- fetch full content from PostgreSQL ---------------------------------

    memory_ids = [UUID(item["id"]) for item in scored_list]
    score_map = {item["id"]: item["score"] for item in scored_list}

    stmt = select(MemoryModel).where(
        MemoryModel.id.in_(memory_ids),
        MemoryModel.invalidated_at.is_(None),
    )
    result = await db.execute(stmt)
    memories = {str(m.id): m for m in result.scalars().all()}

    # Bump recall counts
    found_ids = [UUID(mid) for mid in memories]
    await service.increment_recall(found_ids)

    # Build response in fused-score order
    output: list[dict] = []
    for item in scored_list:
        mid = item["id"]
        mem = memories.get(mid)
        if not mem:
            continue
        output.append(
            {
                "id": str(mem.id),
                "content": mem.content,
                "memory_type": mem.memory_type,
                "tier": mem.tier,
                "confidence": mem.confidence,
                "score": score_map[mid],
                "observed_at": mem.observed_at.isoformat() if mem.observed_at else None,
                "workspace_id": str(mem.workspace_id) if mem.workspace_id else None,
                "tags": mem.tags or [],
                "source": "fusion",
            }
        )

    return output
