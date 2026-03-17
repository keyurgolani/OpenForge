"""
Graph traversal algorithms.

Provides graph traversal and neighborhood queries.
"""

from __future__ import annotations

import logging
import uuid
from collections import deque
from typing import Any, Optional

from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    EntityModel,
    RelationshipModel,
)
from .types import (
    EntityType,
    NeighborEntry,
    NeighborResponse,
    PathHop,
    PathResponse,
)
from .schemas import (
    EntityResponse,
    RelationshipResponse,
)

logger = logging.getLogger(__name__)


class GraphTraversalService:
    """
    Graph traversal and neighborhood queries.

    This service provides:
    - Entity neighbor queries (what's connected to this entity?)
    - Relationship queries (what relationships involve this entity?)
    - Path finding between entities
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_entity_neighbors(
        self,
        entity_id: uuid.UUID,
        relationship_types: list[str] | None = None,
        direction: str = "both",  # incoming, outgoing, both
        max_depth: int = 1,
        limit: int = 50,
    ) -> NeighborResponse:
        """
        Get entities connected to this entity.

        Args:
            entity_id: Entity to find neighbors for
            relationship_types: Filter to specific relationship predicates
            direction: incoming, outgoing, or both
            max_depth: How many hops (1-3)
            limit: Max neighbors to return

        Returns:
            NeighborResponse with entity and neighbors
        """
        # Get the source entity
        entity = await self.db.get(EntityModel, entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        neighbors = []
        visited = {entity_id}
        queue = deque([(entity_id, 0)])  # (entity_id, depth)

        while queue and len(neighbors) < limit:
            current_id, depth = queue.popleft()

            if depth >= max_depth:
                continue

            # Get relationships involving this entity
            rel_query = select(RelationshipModel).where(
                RelationshipModel.status == "active",
                or_(
                    RelationshipModel.subject_entity_id == current_id,
                    RelationshipModel.object_entity_id == current_id,
                ),
            )

            if relationship_types:
                rel_query = rel_query.where(
                    RelationshipModel.predicate.in_(relationship_types)
                )

            rel_result = await self.db.execute(rel_query)
            relationships = rel_result.scalars().all()

            for rel in relationships:
                # Determine direction and neighbor
                if rel.subject_entity_id == current_id:
                    neighbor_id = rel.object_entity_id
                    rel_direction = "outgoing"
                else:
                    neighbor_id = rel.subject_entity_id
                    rel_direction = "incoming"

                # Filter by direction
                if direction != "both" and direction != rel_direction:
                    continue

                # Skip if already visited
                if neighbor_id in visited:
                    continue

                visited.add(neighbor_id)

                # Get neighbor entity
                neighbor_entity = await self.db.get(EntityModel, neighbor_id)
                if not neighbor_entity or neighbor_entity.status != "active":
                    continue

                neighbors.append(NeighborEntry(
                    entity_id=neighbor_entity.id,
                    entity_name=neighbor_entity.canonical_name,
                    entity_type=EntityType(neighbor_entity.entity_type),
                    relationship_id=rel.id,
                    predicate=rel.predicate,
                    direction=rel_direction,
                ))

                # Add to queue for further traversal
                queue.append((neighbor_id, depth + 1))

        return NeighborResponse(
            entity_id=entity_id,
            neighbors=neighbors[:limit],
            total=len(neighbors),
        )

    async def get_entity_relationships(
        self,
        entity_id: uuid.UUID,
        as_subject: bool = True,
        as_object: bool = True,
        predicate: str | None = None,
        status: str = "active",
        limit: int = 100,
    ) -> list[RelationshipResponse]:
        """
        Get all relationships involving this entity.

        Args:
            entity_id: Entity to get relationships for
            as_subject: Include relationships where entity is subject
            as_object: Include relationships where entity is object
            predicate: Filter to specific predicate
            status: Relationship status filter
            limit: Max results

        Returns:
            List of relationship responses
        """
        conditions = [RelationshipModel.status == status]

        if as_subject and as_object:
            conditions.append(
                or_(
                    RelationshipModel.subject_entity_id == entity_id,
                    RelationshipModel.object_entity_id == entity_id,
                )
            )
        elif as_subject:
            conditions.append(RelationshipModel.subject_entity_id == entity_id)
        elif as_object:
            conditions.append(RelationshipModel.object_entity_id == entity_id)
        else:
            return []

        if predicate:
            conditions.append(RelationshipModel.predicate == predicate)

        query = select(RelationshipModel).where(*conditions).limit(limit)
        result = await self.db.execute(query)
        relationships = result.scalars().all()

        return [self._serialize_relationship(r) for r in relationships]

    async def find_path(
        self,
        from_entity_id: uuid.UUID,
        to_entity_id: uuid.UUID,
        max_depth: int = 3,
    ) -> PathResponse:
        """
        Find a path between two entities using BFS.

        Args:
            from_entity_id: Starting entity
            to_entity_id: Target entity
            max_depth: Maximum hops to search (1-5)

        Returns:
            PathResponse with path if found
        """
        if from_entity_id == to_entity_id:
            return PathResponse(
                from_entity_id=from_entity_id,
                to_entity_id=to_entity_id,
                hops=[],
                total_hops=0,
                found=True,
            )

        # BFS to find shortest path
        visited = {from_entity_id}
        queue = deque([(from_entity_id, [])])  # (current_id, path_so_far)

        while queue:
            current_id, path = queue.popleft()

            if len(path) >= max_depth:
                continue

            # Get relationships from current entity
            rel_query = select(RelationshipModel).where(
                RelationshipModel.status == "active",
                or_(
                    RelationshipModel.subject_entity_id == current_id,
                    RelationshipModel.object_entity_id == current_id,
                ),
            )
            rel_result = await self.db.execute(rel_query)
            relationships = rel_result.scalars().all()

            for rel in relationships:
                # Determine neighbor
                if rel.subject_entity_id == current_id:
                    neighbor_id = rel.object_entity_id
                else:
                    neighbor_id = rel.subject_entity_id

                # Found the target!
                if neighbor_id == to_entity_id:
                    new_hop = PathHop(
                        from_entity_id=current_id,
                        to_entity_id=neighbor_id,
                        relationship_id=rel.id,
                        predicate=rel.predicate,
                    )
                    return PathResponse(
                        from_entity_id=from_entity_id,
                        to_entity_id=to_entity_id,
                        hops=path + [new_hop],
                        total_hops=len(path) + 1,
                        found=True,
                    )

                # Continue search if not visited
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    new_hop = PathHop(
                        from_entity_id=current_id,
                        to_entity_id=neighbor_id,
                        relationship_id=rel.id,
                        predicate=rel.predicate,
                    )
                    queue.append((neighbor_id, path + [new_hop]))

        # No path found
        return PathResponse(
            from_entity_id=from_entity_id,
            to_entity_id=to_entity_id,
            hops=[],
            total_hops=0,
            found=False,
        )

    async def get_entity_subgraph(
        self,
        entity_id: uuid.UUID,
        max_depth: int = 2,
        max_entities: int = 50,
    ) -> dict[str, Any]:
        """
        Get a subgraph centered on an entity.

        This is useful for visualization and exploration.

        Args:
            entity_id: Center entity
            max_depth: Maximum hops from center
            max_entities: Maximum entities to include

        Returns:
            Dict with entities and relationships for the subgraph
        """
        entities = {}
        relationships = {}
        visited = {entity_id}
        queue = deque([(entity_id, 0)])

        # Get center entity
        center = await self.db.get(EntityModel, entity_id)
        if not center:
            raise ValueError(f"Entity {entity_id} not found")

        entities[entity_id] = {
            "id": str(entity_id),
            "name": center.canonical_name,
            "type": center.entity_type,
            "is_center": True,
        }

        while queue and len(entities) < max_entities:
            current_id, depth = queue.popleft()

            if depth >= max_depth:
                continue

            # Get relationships
            rel_query = select(RelationshipModel).where(
                RelationshipModel.status == "active",
                or_(
                    RelationshipModel.subject_entity_id == current_id,
                    RelationshipModel.object_entity_id == current_id,
                ),
            )
            rel_result = await self.db.execute(rel_query)
            rels = rel_result.scalars().all()

            for rel in rels:
                relationships[rel.id] = {
                    "id": str(rel.id),
                    "subject_id": str(rel.subject_entity_id),
                    "object_id": str(rel.object_entity_id),
                    "predicate": rel.predicate,
                    "type": rel.relationship_type,
                }

                # Add entities
                for entity_id_attr in [rel.subject_entity_id, rel.object_entity_id]:
                    if entity_id_attr not in visited and len(entities) < max_entities:
                        entity = await self.db.get(EntityModel, entity_id_attr)
                        if entity and entity.status == "active":
                            entities[entity_id_attr] = {
                                "id": str(entity_id_attr),
                                "name": entity.canonical_name,
                                "type": entity.entity_type,
                                "is_center": entity_id_attr == entity_id,
                            }
                            visited.add(entity_id_attr)
                            queue.append((entity_id_attr, depth + 1))

        return {
            "entities": list(entities.values()),
            "relationships": list(relationships.values()),
            "center_id": str(entity_id),
        }

    async def get_entity_statistics(
        self,
        workspace_id: uuid.UUID,
        entity_id: uuid.UUID,
    ) -> dict[str, Any]:
        """
        Get statistics about an entity's position in the graph.

        Args:
            workspace_id: Workspace ID
            entity_id: Entity to analyze

        Returns:
            Statistics dict
        """
        # Count relationships
        rel_query = select(RelationshipModel).where(
            RelationshipModel.workspace_id == workspace_id,
            RelationshipModel.status == "active",
            or_(
                RelationshipModel.subject_entity_id == entity_id,
                RelationshipModel.object_entity_id == entity_id,
            ),
        )
        rel_result = await self.db.execute(rel_query)
        relationships = rel_result.scalars().all()

        outgoing = sum(1 for r in relationships if r.subject_entity_id == entity_id)
        incoming = sum(1 for r in relationships if r.object_entity_id == entity_id)

        # Get unique predicates
        predicates = list(set(r.predicate for r in relationships))

        # Get unique connected entities
        connected = set()
        for r in relationships:
            if r.subject_entity_id == entity_id:
                connected.add(r.object_entity_id)
            else:
                connected.add(r.subject_entity_id)

        return {
            "entity_id": str(entity_id),
            "total_relationships": len(relationships),
            "outgoing_relationships": outgoing,
            "incoming_relationships": incoming,
            "unique_predicates": predicates,
            "connected_entities": len(connected),
        }

    def _serialize_relationship(self, rel: RelationshipModel) -> RelationshipResponse:
        """Serialize a relationship model to response."""
        from .types import RelationshipDirectionality

        return RelationshipResponse(
            id=rel.id,
            workspace_id=rel.workspace_id,
            subject_entity_id=rel.subject_entity_id,
            object_entity_id=rel.object_entity_id,
            predicate=rel.predicate,
            relationship_type=rel.relationship_type,
            attributes=rel.attributes_json,
            status=rel.status,
            confidence=rel.confidence,
            support_count=rel.support_count,
            directionality=RelationshipDirectionality(rel.directionality),
            created_at=rel.created_at,
            updated_at=rel.updated_at,
        )
