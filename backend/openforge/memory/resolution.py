"""Entity resolution — deduplicates extracted entities against the Neo4j graph.

Supports three match tiers:
  1. **Exact** (case-insensitive name + same type) → auto_merge, score 1.0
  2. **Fuzzy** (rapidfuzz ratio ≥ 0.95) → auto_merge
  3. **Fuzzy** (0.85 ≤ ratio < 0.95) → flag_same_as (needs human review)

Entities are never merged across different POLE+O types.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from rapidfuzz import fuzz

from openforge.db.neo4j_client import get_neo4j_driver
from openforge.memory.extraction import ExtractedEntity

logger = logging.getLogger("openforge.memory.resolution")

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
_AUTO_MERGE_THRESHOLD: float = 0.95
_FLAG_SAME_AS_THRESHOLD: float = 0.85
_FUZZY_CANDIDATE_LIMIT: int = 200


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class ResolvedEntity:
    """Result of resolving a single extracted entity against the graph."""

    entity: ExtractedEntity
    matched_node_id: str | None
    match_type: str  # "new" | "auto_merge" | "flag_same_as"
    match_score: float


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def resolve_entity(entity: ExtractedEntity) -> ResolvedEntity:
    """Resolve *entity* against existing Entity nodes in Neo4j.

    Resolution strategy (type-aware — never merges across types):
      1. Exact case-insensitive name match → auto_merge (score 1.0).
      2. Fuzzy match (rapidfuzz ratio):
         - ≥ 0.95 → auto_merge
         - 0.85–0.95 → flag_same_as
      3. No match → new (score 0.0).
    """
    driver = get_neo4j_driver()

    # --- 1. Exact match ------------------------------------------------
    exact_cypher = (
        "MATCH (e:Entity) "
        "WHERE e.type = $type AND toLower(e.name) = toLower($name) "
        "RETURN e.id AS id LIMIT 1"
    )

    entity_type = entity.type if hasattr(entity, "type") else getattr(entity, "entity_type", "")

    async with driver.session() as session:
        result = await session.run(exact_cypher, type=entity_type, name=entity.name)
        record = await result.single()

    if record is not None:
        logger.debug("Exact match for %s/%s → %s", entity_type, entity.name, record["id"])
        return ResolvedEntity(
            entity=entity,
            matched_node_id=record["id"],
            match_type="auto_merge",
            match_score=1.0,
        )

    # --- 2. Fuzzy match ------------------------------------------------
    fuzzy_cypher = (
        "MATCH (e:Entity) "
        "WHERE e.type = $type "
        "RETURN e.id AS id, e.name AS name "
        "LIMIT $limit"
    )

    async with driver.session() as session:
        result = await session.run(fuzzy_cypher, type=entity_type, limit=_FUZZY_CANDIDATE_LIMIT)
        candidates: list[tuple[str, str]] = [
            (record["id"], record["name"]) async for record in result
        ]

    if candidates:
        best_id: str | None = None
        best_name: str | None = None
        best_score: float = 0.0

        for node_id, node_name in candidates:
            # rapidfuzz.fuzz.ratio returns 0-100; normalise to 0-1.
            score = fuzz.ratio(entity.name, node_name) / 100.0
            if score > best_score:
                best_score = score
                best_id = node_id
                best_name = node_name

        if best_score >= _AUTO_MERGE_THRESHOLD:
            logger.debug(
                "Fuzzy auto_merge for %s/%s → %s (%.3f, matched '%s')",
                entity_type, entity.name, best_id, best_score, best_name,
            )
            return ResolvedEntity(
                entity=entity,
                matched_node_id=best_id,
                match_type="auto_merge",
                match_score=best_score,
            )

        if best_score >= _FLAG_SAME_AS_THRESHOLD:
            logger.debug(
                "Fuzzy flag_same_as for %s/%s → %s (%.3f, matched '%s')",
                entity_type, entity.name, best_id, best_score, best_name,
            )
            return ResolvedEntity(
                entity=entity,
                matched_node_id=best_id,
                match_type="flag_same_as",
                match_score=best_score,
            )

    # --- 3. No match → new ---------------------------------------------
    logger.debug("No match for %s/%s → new entity", entity_type, entity.name)
    return ResolvedEntity(
        entity=entity,
        matched_node_id=None,
        match_type="new",
        match_score=0.0,
    )


async def resolve_entities(entities: list[ExtractedEntity]) -> list[ResolvedEntity]:
    """Resolve a batch of extracted entities against the graph."""
    return [await resolve_entity(e) for e in entities]
