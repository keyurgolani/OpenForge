"""Neo4j graph traversal search for memory retrieval."""

from __future__ import annotations

import logging
import re
from typing import Any

from openforge.db.neo4j_client import get_neo4j_driver
from openforge.memory.extraction import extract_spacy

logger = logging.getLogger("openforge.memory.graph_search")


async def search_graph(
    query: str,
    depth: int = 2,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Search the memory graph by extracting entities and traversing Neo4j.

    1. Extract entities from *query* using spaCy (fast, no LLM).
    2. If no entities found, fall back to capitalized words longer than 3 chars.
    3. If still nothing, return an empty list.
    4. Run a BFS-style Cypher traversal from matched Entity nodes, scoring
       connected Memory nodes by graph proximity (``1 / (1 + distance)``).

    Returns a list of dicts with keys:
        id, content, memory_type, score, source
    """
    # Step 1 -- entity extraction via spaCy
    result = extract_spacy(query)
    names: list[str] = [e.name for e in result.entities]

    # Step 2 -- fallback: capitalized words > 3 chars
    if not names:
        names = re.findall(r"\b[A-Z][a-zA-Z]{3,}\b", query)

    # Step 3 -- nothing to search for
    if not names:
        return []

    # Step 4 -- Cypher traversal
    # Neo4j does not support parameterised variable-length relationship bounds,
    # so ``depth`` is interpolated directly into the query string.
    cypher = (
        "UNWIND $names AS name\n"
        "MATCH (e:Entity)\n"
        "WHERE toLower(e.name) CONTAINS toLower(name)\n"
        "WITH e, name\n"
        "\n"
        f"MATCH path = (e)<-[:MENTIONS|RELATED_TO|ABOUT*1..{int(depth)}]-(m:Memory)\n"
        "WHERE m.memory_type IS NOT NULL\n"
        "\n"
        "WITH m, min(length(path)) AS distance\n"
        "RETURN DISTINCT m.id AS memory_id,\n"
        "       m.content_preview AS preview,\n"
        "       m.memory_type AS memory_type,\n"
        "       distance,\n"
        "       1.0 / (1.0 + distance) AS score\n"
        "ORDER BY score DESC\n"
        "LIMIT $limit"
    )

    driver = get_neo4j_driver()
    async with driver.session() as session:
        result = await session.run(cypher, names=names, limit=limit)
        records = await result.data()

    # Step 5 -- normalise into return format
    return [
        {
            "id": rec["memory_id"],
            "content": rec["preview"],
            "memory_type": rec["memory_type"],
            "score": rec["score"],
            "source": "graph",
        }
        for rec in records
    ]
