"""Neo4j graph writer — persists entities, memories, and relationships.

All functions are async and use the shared Neo4j driver from
:mod:`openforge.db.neo4j_client`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from openforge.db.neo4j_client import get_neo4j_driver
from openforge.memory.extraction import ExtractionResult, ExtractedRelation
from openforge.memory.resolution import ResolvedEntity

logger = logging.getLogger("openforge.memory.graph_writer")


# ---------------------------------------------------------------------------
# Memory nodes
# ---------------------------------------------------------------------------

async def write_memory_node(
    memory_id: str,
    content: str,
    memory_type: str,
    tier: str,
    observed_at: str,
) -> None:
    """MERGE a Memory node by *memory_id*, setting core properties."""
    driver = get_neo4j_driver()
    cypher = (
        "MERGE (m:Memory {id: $id}) "
        "SET m.content_preview = $content_preview, "
        "    m.memory_type = $memory_type, "
        "    m.tier = $tier, "
        "    m.observed_at = $observed_at"
    )
    async with driver.session() as session:
        await session.run(
            cypher,
            id=memory_id,
            content_preview=content[:200],
            memory_type=memory_type,
            tier=tier,
            observed_at=observed_at,
        )
    logger.debug("Wrote Memory node %s (type=%s, tier=%s)", memory_id, memory_type, tier)


# ---------------------------------------------------------------------------
# Entity nodes
# ---------------------------------------------------------------------------

async def write_entity(resolved: ResolvedEntity) -> str:
    """Create or merge an Entity node based on the resolution result.

    Returns the entity node id (either existing or newly created).
    """
    driver = get_neo4j_driver()
    entity = resolved.entity

    entity_type = entity.type if hasattr(entity, "type") else getattr(entity, "entity_type", "")

    if resolved.match_type == "auto_merge" and resolved.matched_node_id:
        # Update existing entity's confidence if the new one is higher.
        cypher = (
            "MATCH (e:Entity {id: $id}) "
            "SET e.confidence = CASE WHEN $confidence > e.confidence "
            "    THEN $confidence ELSE e.confidence END"
        )
        async with driver.session() as session:
            await session.run(
                cypher,
                id=resolved.matched_node_id,
                confidence=entity.confidence,
            )
        logger.debug("Auto-merged entity into %s", resolved.matched_node_id)
        return resolved.matched_node_id

    if resolved.match_type == "flag_same_as" and resolved.matched_node_id:
        # Create a new entity node and link it to the existing one.
        new_id = str(uuid4())
        cypher = (
            "CREATE (e:Entity {"
            "  id: $id, name: $name, type: $type, subtype: $subtype, "
            "  confidence: $confidence, created_at: $created_at"
            "}) "
            "WITH e "
            "MATCH (existing:Entity {id: $matched_id}) "
            "MERGE (e)-[:SAME_AS {status: 'pending'}]->(existing)"
        )
        async with driver.session() as session:
            await session.run(
                cypher,
                id=new_id,
                name=entity.name,
                type=entity_type,
                subtype=entity.subtype,
                confidence=entity.confidence,
                created_at=datetime.now(timezone.utc).isoformat(),
                matched_id=resolved.matched_node_id,
            )
        logger.debug(
            "Created entity %s with SAME_AS → %s", new_id, resolved.matched_node_id
        )
        return new_id

    # match_type == "new" (or fallback)
    new_id = str(uuid4())
    cypher = (
        "CREATE (e:Entity {"
        "  id: $id, name: $name, type: $type, subtype: $subtype, "
        "  confidence: $confidence, created_at: $created_at"
        "})"
    )
    async with driver.session() as session:
        await session.run(
            cypher,
            id=new_id,
            name=entity.name,
            type=entity_type,
            subtype=entity.subtype,
            confidence=entity.confidence,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    logger.debug("Created new entity %s (%s/%s)", new_id, entity_type, entity.name)
    return new_id


# ---------------------------------------------------------------------------
# MENTIONS relationships
# ---------------------------------------------------------------------------

async def write_mentions(
    memory_id: str,
    entity_ids: list[str],
    confidences: list[float],
) -> None:
    """MERGE a MENTIONS edge from a Memory to each Entity with its confidence."""
    driver = get_neo4j_driver()
    cypher = (
        "MATCH (m:Memory {id: $memory_id}), (e:Entity {id: $entity_id}) "
        "MERGE (m)-[r:MENTIONS]->(e) "
        "SET r.confidence = $confidence"
    )
    async with driver.session() as session:
        for entity_id, confidence in zip(entity_ids, confidences):
            await session.run(
                cypher,
                memory_id=memory_id,
                entity_id=entity_id,
                confidence=confidence,
            )
    logger.debug(
        "Wrote %d MENTIONS edges from Memory %s", len(entity_ids), memory_id
    )


# ---------------------------------------------------------------------------
# RELATED_TO relationships
# ---------------------------------------------------------------------------

async def write_relations(
    relations: list[ExtractedRelation],
    entity_name_to_id: dict[str, str],
) -> None:
    """MERGE RELATED_TO edges between entities for each extracted relation."""
    driver = get_neo4j_driver()
    cypher = (
        "MATCH (s:Entity {id: $source_id}), (t:Entity {id: $target_id}) "
        "MERGE (s)-[r:RELATED_TO {type: $rel_type}]->(t) "
        "SET r.confidence = $confidence"
    )
    async with driver.session() as session:
        for rel in relations:
            src_name = rel.source_entity if hasattr(rel, "source_entity") else getattr(rel, "source_name", "")
            tgt_name = rel.target_entity if hasattr(rel, "target_entity") else getattr(rel, "target_name", "")
            source_id = entity_name_to_id.get(src_name)
            target_id = entity_name_to_id.get(tgt_name)
            if source_id is None or target_id is None:
                logger.warning(
                    "Skipping relation %s→%s: entity not found in mapping",
                    src_name,
                    tgt_name,
                )
                continue
            await session.run(
                cypher,
                source_id=source_id,
                target_id=target_id,
                rel_type=rel.relation_type,
                confidence=rel.confidence,
            )
    logger.debug("Wrote %d RELATED_TO edges", len(relations))


# ---------------------------------------------------------------------------
# Provenance relationships
# ---------------------------------------------------------------------------

async def write_workspace_provenance(memory_id: str, workspace_id: str) -> None:
    """MERGE Workspace node and link the Memory to it via EXTRACTED_FROM."""
    driver = get_neo4j_driver()
    cypher = (
        "MERGE (w:Workspace {id: $workspace_id}) "
        "WITH w "
        "MATCH (m:Memory {id: $memory_id}) "
        "MERGE (m)-[:EXTRACTED_FROM]->(w)"
    )
    async with driver.session() as session:
        await session.run(
            cypher,
            memory_id=memory_id,
            workspace_id=workspace_id,
        )
    logger.debug("Linked Memory %s → Workspace %s", memory_id, workspace_id)


async def write_agent_provenance(memory_id: str, agent_id: str) -> None:
    """MERGE Agent node and link the Memory to it via PRODUCED_BY."""
    driver = get_neo4j_driver()
    cypher = (
        "MERGE (a:Agent {id: $agent_id}) "
        "WITH a "
        "MATCH (m:Memory {id: $memory_id}) "
        "MERGE (m)-[:PRODUCED_BY]->(a)"
    )
    async with driver.session() as session:
        await session.run(
            cypher,
            memory_id=memory_id,
            agent_id=agent_id,
        )
    logger.debug("Linked Memory %s → Agent %s", memory_id, agent_id)
