"""
Graph provenance management.

Manages provenance links between graph objects and their sources.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    EntityModel,
    EntityMentionModel,
    RelationshipModel,
    RelationshipMentionModel,
    GraphProvenanceLinkModel,
    Knowledge,
    EvidencePacketModel,
)
from .types import (
    GraphObjectType,
    SourceType,
    ProvenanceLinkRef,
    GraphObjectReference,
    DocumentReference,
    EvidenceReference,
)
from .schemas import (
    ProvenanceLinkCreate,
    ProvenanceLinkResponse,
    ProvenanceLinkListResponse,
    EntitySourcesResponse,
    EntityDocumentReference,
    EntityEvidenceReference,
)

logger = logging.getLogger(__name__)


def now_utc():
    return datetime.now(timezone.utc)


class ProvenanceService:
    """
    Manages provenance links for graph objects.

    Every canonical entity and relationship must have at least one provenance
    link tracing it back to source material. This service ensures:

    1. Complete provenance tracking
    2. Source-to-graph object queries
    3. Graph object-to-source queries
    4. Evidence chain validation
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_provenance_link(
        self,
        workspace_id: uuid.UUID,
        graph_object_type: str,  # entity, relationship
        graph_object_id: uuid.UUID,
        source_type: str,  # knowledge, chunk, evidence_packet, evidence_item
        source_id: uuid.UUID,
        excerpt: str | None = None,
        char_start: int | None = None,
        char_end: int | None = None,
        confidence: float = 1.0,
        extraction_method: str = "llm",
    ) -> ProvenanceLinkResponse:
        """
        Create a provenance link from a graph object to its source.

        Args:
            workspace_id: Workspace ID
            graph_object_type: Type of graph object (entity, relationship)
            graph_object_id: ID of the graph object
            source_type: Type of source material
            source_id: ID of the source
            excerpt: Optional excerpt showing the evidence
            char_start: Optional character start position
            char_end: Optional character end position
            confidence: Confidence in this provenance link
            extraction_method: How this link was created

        Returns:
            The created provenance link
        """
        # Validate graph object exists
        if graph_object_type == GraphObjectType.ENTITY.value:
            entity = await self.db.get(EntityModel, graph_object_id)
            if not entity:
                raise ValueError(f"Entity {graph_object_id} not found")
        elif graph_object_type == GraphObjectType.RELATIONSHIP.value:
            relationship = await self.db.get(RelationshipModel, graph_object_id)
            if not relationship:
                raise ValueError(f"Relationship {graph_object_id} not found")
        else:
            raise ValueError(f"Invalid graph object type: {graph_object_type}")

        link = GraphProvenanceLinkModel(
            workspace_id=workspace_id,
            graph_object_type=graph_object_type,
            graph_object_id=graph_object_id,
            source_type=source_type,
            source_id=source_id,
            excerpt=excerpt,
            char_start=char_start,
            char_end=char_end,
            confidence=confidence,
            extraction_method=extraction_method,
        )
        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)

        logger.debug(
            f"Created provenance link: {graph_object_type}/{graph_object_id} -> "
            f"{source_type}/{source_id}"
        )

        return self._serialize_link(link)

    async def get_entity_provenance(
        self,
        entity_id: uuid.UUID,
    ) -> ProvenanceLinkListResponse:
        """
        Get all provenance links for an entity.

        This shows all sources that contributed to this entity's
        creation and ongoing knowledge.

        Args:
            entity_id: ID of the entity

        Returns:
            List of provenance links
        """
        links = await self._get_provenance_links(
            graph_object_type=GraphObjectType.ENTITY.value,
            graph_object_id=entity_id,
        )

        return ProvenanceLinkListResponse(
            links=links,
            total=len(links),
        )

    async def get_relationship_provenance(
        self,
        relationship_id: uuid.UUID,
    ) -> ProvenanceLinkListResponse:
        """
        Get all provenance links for a relationship.

        Args:
            relationship_id: ID of the relationship

        Returns:
            List of provenance links
        """
        links = await self._get_provenance_links(
            graph_object_type=GraphObjectType.RELATIONSHIP.value,
            graph_object_id=relationship_id,
        )

        return ProvenanceLinkListResponse(
            links=links,
            total=len(links),
        )

    async def _get_provenance_links(
        self,
        graph_object_type: str,
        graph_object_id: uuid.UUID,
    ) -> list[ProvenanceLinkResponse]:
        """Get provenance links for a graph object."""
        query = select(GraphProvenanceLinkModel).where(
            GraphProvenanceLinkModel.graph_object_type == graph_object_type,
            GraphProvenanceLinkModel.graph_object_id == graph_object_id,
        ).order_by(GraphProvenanceLinkModel.confidence.desc())

        result = await self.db.execute(query)
        links = result.scalars().all()

        return [self._serialize_link(link) for link in links]

    async def get_source_graph_objects(
        self,
        source_type: str,
        source_id: uuid.UUID,
    ) -> list[GraphObjectReference]:
        """
        Get all graph objects linked to a source.

        This is useful for:
        - Finding all entities mentioned in a document
        - Finding all relationships from an evidence packet

        Args:
            source_type: Type of source
            source_id: ID of the source

        Returns:
            List of graph object references
        """
        query = select(GraphProvenanceLinkModel).where(
            GraphProvenanceLinkModel.source_type == source_type,
            GraphProvenanceLinkModel.source_id == source_id,
        ).order_by(GraphProvenanceLinkModel.created_at.desc())

        result = await self.db.execute(query)
        links = result.scalars().all()

        references = []
        for link in links:
            # Get object name for context
            object_name = await self._get_object_name(
                link.graph_object_type,
                link.graph_object_id,
            )

            references.append(GraphObjectReference(
                graph_object_type=GraphObjectType(link.graph_object_type),
                graph_object_id=link.graph_object_id,
                object_name=object_name,
                confidence=link.confidence,
            ))

        return references

    async def _get_object_name(
        self,
        graph_object_type: str,
        graph_object_id: uuid.UUID,
    ) -> str:
        """Get a display name for a graph object."""
        if graph_object_type == GraphObjectType.ENTITY.value:
            entity = await self.db.get(EntityModel, graph_object_id)
            return entity.canonical_name if entity else "Unknown Entity"
        elif graph_object_type == GraphObjectType.RELATIONSHIP.value:
            rel = await self.db.get(RelationshipModel, graph_object_id)
            if rel:
                subject = await self.db.get(EntityModel, rel.subject_entity_id)
                obj = await self.db.get(EntityModel, rel.object_entity_id)
                subject_name = subject.canonical_name if subject else "?"
                object_name = obj.canonical_name if obj else "?"
                return f"{subject_name} {rel.predicate} {object_name}"
            return "Unknown Relationship"
        return "Unknown"

    async def get_entity_sources(
        self,
        entity_id: uuid.UUID,
    ) -> EntitySourcesResponse:
        """
        Get all source documents and evidence for an entity.

        This aggregates provenance links into a cleaner view showing:
        - Documents that mention this entity
        - Evidence packets that support this entity

        Args:
            entity_id: ID of the entity

        Returns:
            EntitySourcesResponse with documents and evidence
        """
        # Get all provenance links for this entity
        prov_result = await self.get_entity_provenance(entity_id)

        # Group by source type
        documents = []
        evidence_packets = []
        seen_docs = set()
        seen_packets = set()

        for link in prov_result.links:
            if link.source_type == SourceType.KNOWLEDGE.value:
                if link.source_id not in seen_docs:
                    doc = await self.db.get(KnowledgeModel, link.source_id)
                    if doc:
                        documents.append(EntityDocumentReference(
                            document_id=doc.id,
                            title=doc.title or "Untitled",
                            mention_count=1,
                            last_mentioned_at=link.created_at,
                        ))
                        seen_docs.add(link.source_id)
                    else:
                        # Document may have been deleted
                        logger.warning(f"Knowledge {link.source_id} not found for entity {entity_id}")

            elif link.source_type == SourceType.EVIDENCE_PACKET.value:
                if link.source_id not in seen_packets:
                    packet = await self.db.get(EvidencePacketModel, link.source_id)
                    if packet:
                        evidence_packets.append(EntityEvidenceReference(
                            evidence_packet_id=packet.id,
                            item_count=packet.item_count,
                            confidence=link.confidence,
                        ))
                        seen_packets.add(link.source_id)

        return EntitySourcesResponse(
            entity_id=entity_id,
            documents=documents,
            evidence_packets=evidence_packets,
        )

    async def validate_provenance(
        self,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """
        Validate that all canonical objects have provenance.

        This is a guardrail check to ensure:
        - Every entity has at least one provenance link
        - Every relationship has at least one provenance link

        Args:
            workspace_id: Workspace to validate

        Returns:
            Validation report with any issues found
        """
        report = {
            "workspace_id": str(workspace_id),
            "valid": True,
            "entities_without_provenance": [],
            "relationships_without_provenance": [],
            "total_entities": 0,
            "total_relationships": 0,
            "entities_with_provenance": 0,
            "relationships_with_provenance": 0,
        }

        # Check entities
        entity_query = select(EntityModel).where(
            EntityModel.workspace_id == workspace_id,
            EntityModel.status == "active",
        )
        entities_result = await self.db.execute(entity_query)
        entities = entities_result.scalars().all()
        report["total_entities"] = len(entities)

        for entity in entities:
            has_provenance = await self._has_provenance(
                GraphObjectType.ENTITY.value,
                entity.id,
            )
            if has_provenance:
                report["entities_with_provenance"] += 1
            else:
                report["entities_without_provenance"].append({
                    "id": str(entity.id),
                    "name": entity.canonical_name,
                    "type": entity.entity_type,
                })
                report["valid"] = False

        # Check relationships
        rel_query = select(RelationshipModel).where(
            RelationshipModel.workspace_id == workspace_id,
            RelationshipModel.status == "active",
        )
        rels_result = await self.db.execute(rel_query)
        relationships = rels_result.scalars().all()
        report["total_relationships"] = len(relationships)

        for rel in relationships:
            has_provenance = await self._has_provenance(
                GraphObjectType.RELATIONSHIP.value,
                rel.id,
            )
            if has_provenance:
                report["relationships_with_provenance"] += 1
            else:
                report["relationships_without_provenance"].append({
                    "id": str(rel.id),
                    "predicate": rel.predicate,
                })
                report["valid"] = False

        return report

    async def _has_provenance(
        self,
        graph_object_type: str,
        graph_object_id: uuid.UUID,
    ) -> bool:
        """Check if a graph object has at least one provenance link."""
        query = select(GraphProvenanceLinkModel).where(
            GraphProvenanceLinkModel.graph_object_type == graph_object_type,
            GraphProvenanceLinkModel.graph_object_id == graph_object_id,
        ).limit(1)

        result = await self.db.execute(query)
        return result.scalar() is not None

    async def delete_provenance_links_for_source(
        self,
        source_type: str,
        source_id: uuid.UUID,
    ) -> int:
        """
        Delete all provenance links for a source.

        This is useful when a source document is deleted.

        Args:
            source_type: Type of source
            source_id: ID of the source

        Returns:
            Number of links deleted
        """
        query = select(GraphProvenanceLinkModel).where(
            GraphProvenanceLinkModel.source_type == source_type,
            GraphProvenanceLinkModel.source_id == source_id,
        )

        result = await self.db.execute(query)
        links = result.scalars().all()

        count = 0
        for link in links:
            await self.db.delete(link)
            count += 1

        if count > 0:
            await self.db.commit()
            logger.info(f"Deleted {count} provenance links for {source_type}/{source_id}")

        return count

    async def get_provenance_chain(
        self,
        graph_object_type: str,
        graph_object_id: uuid.UUID,
        max_depth: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Get the full provenance chain for a graph object.

        This traces back through all sources and their sources if applicable.

        Args:
            graph_object_type: Type of graph object
            graph_object_id: ID of graph object
            max_depth: Maximum depth to traverse

        Returns:
            List of provenance chain entries
        """
        chain = []
        visited = set()

        async def traverse(obj_type: str, obj_id: uuid.UUID, depth: int):
            if depth > max_depth:
                return

            key = f"{obj_type}:{obj_id}"
            if key in visited:
                return
            visited.add(key)

            if obj_type in (GraphObjectType.ENTITY.value, GraphObjectType.RELATIONSHIP.value):
                # Get provenance links for this object
                links = await self._get_provenance_links(obj_type, obj_id)
                for link in links:
                    chain.append({
                        "depth": depth,
                        "object_type": obj_type,
                        "object_id": str(obj_id),
                        "source_type": link.source_type,
                        "source_id": str(link.source_id),
                        "excerpt": link.excerpt,
                        "confidence": link.confidence,
                    })
                    # Recursively traverse sources if they're also graph objects
                    if link.source_type in ("entity", "relationship"):
                        await traverse(link.source_type, link.source_id, depth + 1)

        await traverse(graph_object_type, graph_object_id, 0)
        return chain

    def _serialize_link(self, link: GraphProvenanceLinkModel) -> ProvenanceLinkResponse:
        """Serialize a provenance link model to response."""
        citation = None
        if link.char_start is not None and link.char_end is not None:
            citation = {
                "start": link.char_start,
                "end": link.char_end,
            }

        return ProvenanceLinkResponse(
            id=link.id,
            workspace_id=link.workspace_id,
            graph_object_type=GraphObjectType(link.graph_object_type),
            graph_object_id=link.graph_object_id,
            source_type=SourceType(link.source_type),
            source_id=link.source_id,
            excerpt=link.excerpt,
            citation=citation,
            confidence=link.confidence,
            extraction_method=link.extraction_method,
            created_at=link.created_at,
        )
