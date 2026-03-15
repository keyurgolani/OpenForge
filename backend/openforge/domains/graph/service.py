"""
Graph service for Phase 5.

Provides canonical graph CRUD, bounded graph queries, and normalization
inspection surfaces.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    EntityAliasModel,
    EntityCanonicalizationRecordModel,
    EntityModel,
    RelationshipModel,
)
from .normalization import GraphNormalizationService
from .provenance import ProvenanceService
from .schemas import (
    EntityAliasCreate,
    EntityAliasListResponse,
    EntityAliasResponse,
    EntityCanonicalizationRecordListResponse,
    EntityCanonicalizationRecordResponse,
    EntityCreate,
    EntityListResponse,
    EntityResponse,
    EntitySearchParams,
    EntityUpdate,
    GraphQueryRequest,
    GraphQueryResultResponse,
    RelationshipCreate,
    RelationshipListResponse,
    RelationshipResponse,
)
from .traversal import GraphTraversalService
from .types import (
    AliasType,
    EntityStatus,
    EntityType,
    ExtractionMethod,
    GraphObjectType,
    GraphQueryType,
    RelationshipDirectionality,
    RelationshipStatus,
    SourceType,
)

logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class GraphService:
    """
    Main service for graph operations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.normalization = GraphNormalizationService(db)
        self.provenance = ProvenanceService(db)
        self.traversal = GraphTraversalService(db)

    async def list_entities(
        self,
        workspace_id: uuid.UUID,
        entity_type: EntityType | None = None,
        status: EntityStatus | None = None,
        min_confidence: float = 0.0,
        skip: int = 0,
        limit: int = 50,
    ) -> EntityListResponse:
        query = select(EntityModel).where(EntityModel.workspace_id == workspace_id)
        if entity_type:
            query = query.where(EntityModel.entity_type == entity_type.value)
        if status:
            query = query.where(EntityModel.status == status.value)
        if min_confidence > 0:
            query = query.where(EntityModel.confidence >= min_confidence)

        total = await self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self.db.execute(
            query.order_by(EntityModel.last_seen_at.desc()).offset(skip).limit(limit)
        )
        entities = list(result.scalars().all())
        return EntityListResponse(
            entities=[self._serialize_entity(entity) for entity in entities],
            total=total,
        )

    async def get_entity(self, entity_id: uuid.UUID) -> EntityResponse | None:
        entity = await self.db.get(EntityModel, entity_id)
        if not entity:
            return None
        return self._serialize_entity(entity)

    async def create_entity(
        self,
        data: EntityCreate,
        provenance_source_type: str | SourceType | None = None,
        provenance_source_id: uuid.UUID | None = None,
    ) -> EntityResponse:
        if not provenance_source_type or not provenance_source_id:
            raise ValueError("Entity provenance_source_type and provenance_source_id are required")

        entity = EntityModel(
            workspace_id=data.workspace_id,
            canonical_name=data.canonical_name,
            normalized_key=self.normalization.generate_normalized_key(
                data.canonical_name,
                data.entity_type.value,
            ),
            entity_type=data.entity_type.value,
            description=data.description,
            attributes_json=data.attributes,
            status=EntityStatus.ACTIVE.value,
            confidence=1.0,
            source_count=1,
            last_seen_at=now_utc(),
        )
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)

        await self.provenance.create_provenance_link(
            workspace_id=data.workspace_id,
            graph_object_type=GraphObjectType.ENTITY.value,
            graph_object_id=entity.id,
            source_type=self._source_type_value(provenance_source_type),
            source_id=provenance_source_id,
            confidence=1.0,
            extraction_method=ExtractionMethod.MANUAL.value,
        )

        logger.info("Created entity %s (%s)", entity.id, entity.canonical_name)
        return self._serialize_entity(entity)

    async def update_entity(self, entity_id: uuid.UUID, data: EntityUpdate) -> EntityResponse | None:
        entity = await self.db.get(EntityModel, entity_id)
        if not entity:
            return None

        if data.canonical_name is not None:
            entity.canonical_name = data.canonical_name
            entity.normalized_key = self.normalization.generate_normalized_key(
                data.canonical_name,
                (data.entity_type or EntityType(entity.entity_type)).value,
            )
        if data.entity_type is not None:
            entity.entity_type = data.entity_type.value
        if data.description is not None:
            entity.description = data.description
        if data.attributes is not None:
            entity.attributes_json = data.attributes
        if data.status is not None:
            entity.status = data.status.value
        if data.confidence is not None:
            entity.confidence = data.confidence

        await self.db.commit()
        await self.db.refresh(entity)
        return self._serialize_entity(entity)

    async def delete_entity(self, entity_id: uuid.UUID, soft: bool = True) -> bool:
        entity = await self.db.get(EntityModel, entity_id)
        if not entity:
            return False

        if soft:
            entity.status = EntityStatus.DEPRECATED.value
            await self.db.commit()
        else:
            await self.db.delete(entity)
            await self.db.commit()
        return True

    async def search_entities(self, params: EntitySearchParams) -> EntityListResponse:
        query = select(EntityModel).where(EntityModel.workspace_id == params.workspace_id)
        if params.query:
            search_term = f"%{params.query}%"
            query = query.where(
                or_(
                    EntityModel.canonical_name.ilike(search_term),
                    EntityModel.description.ilike(search_term),
                    EntityModel.normalized_key.ilike(search_term),
                )
            )
        if params.entity_type:
            query = query.where(EntityModel.entity_type == params.entity_type.value)
        if params.status:
            query = query.where(EntityModel.status == params.status.value)
        if params.min_confidence > 0:
            query = query.where(EntityModel.confidence >= params.min_confidence)

        total = await self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self.db.execute(
            query.order_by(EntityModel.confidence.desc(), EntityModel.last_seen_at.desc())
            .offset(params.offset)
            .limit(params.limit)
        )
        entities = list(result.scalars().all())
        return EntityListResponse(
            entities=[self._serialize_entity(entity) for entity in entities],
            total=total,
        )

    async def list_relationships(
        self,
        workspace_id: uuid.UUID,
        entity_id: uuid.UUID | None = None,
        predicate: str | None = None,
        relationship_type: str | None = None,
        status: RelationshipStatus | str | None = None,
        min_confidence: float = 0.0,
        skip: int = 0,
        limit: int = 50,
    ) -> RelationshipListResponse:
        query = select(RelationshipModel).where(RelationshipModel.workspace_id == workspace_id)

        if entity_id:
            query = query.where(
                or_(
                    RelationshipModel.subject_entity_id == entity_id,
                    RelationshipModel.object_entity_id == entity_id,
                )
            )
        if predicate:
            query = query.where(RelationshipModel.predicate == self.normalization.normalize_predicate(predicate))
        if relationship_type:
            query = query.where(RelationshipModel.relationship_type == relationship_type)
        if status:
            status_value = status.value if isinstance(status, RelationshipStatus) else str(status)
            query = query.where(RelationshipModel.status == status_value)
        if min_confidence > 0:
            query = query.where(RelationshipModel.confidence >= min_confidence)

        total = await self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self.db.execute(
            query.order_by(RelationshipModel.created_at.desc()).offset(skip).limit(limit)
        )
        relationships = list(result.scalars().all())
        return RelationshipListResponse(
            relationships=[self._serialize_relationship(relationship) for relationship in relationships],
            total=total,
        )

    async def get_relationship(self, relationship_id: uuid.UUID) -> RelationshipResponse | None:
        relationship = await self.db.get(RelationshipModel, relationship_id)
        if not relationship:
            return None
        return self._serialize_relationship(relationship)

    async def create_relationship(
        self,
        data: RelationshipCreate,
        provenance_source_type: str | SourceType | None = None,
        provenance_source_id: uuid.UUID | None = None,
    ) -> RelationshipResponse:
        if not provenance_source_type or not provenance_source_id:
            raise ValueError("Relationship provenance_source_type and provenance_source_id are required")

        subject = await self.db.get(EntityModel, data.subject_entity_id)
        object_entity = await self.db.get(EntityModel, data.object_entity_id)
        if not subject:
            raise ValueError(f"Subject entity {data.subject_entity_id} not found")
        if not object_entity:
            raise ValueError(f"Object entity {data.object_entity_id} not found")

        relationship = RelationshipModel(
            workspace_id=data.workspace_id,
            subject_entity_id=data.subject_entity_id,
            object_entity_id=data.object_entity_id,
            predicate=self.normalization.normalize_predicate(data.predicate),
            relationship_type=data.relationship_type,
            attributes_json=data.attributes,
            status=RelationshipStatus.ACTIVE.value,
            confidence=1.0,
            support_count=1,
            directionality=data.directionality.value,
        )
        self.db.add(relationship)
        await self.db.commit()
        await self.db.refresh(relationship)

        await self.provenance.create_provenance_link(
            workspace_id=data.workspace_id,
            graph_object_type=GraphObjectType.RELATIONSHIP.value,
            graph_object_id=relationship.id,
            source_type=self._source_type_value(provenance_source_type),
            source_id=provenance_source_id,
            confidence=1.0,
            extraction_method=ExtractionMethod.MANUAL.value,
        )

        logger.info("Created relationship %s (%s)", relationship.id, relationship.predicate)
        return self._serialize_relationship(relationship)

    async def delete_relationship(self, relationship_id: uuid.UUID, soft: bool = True) -> bool:
        relationship = await self.db.get(RelationshipModel, relationship_id)
        if not relationship:
            return False

        if soft:
            relationship.status = RelationshipStatus.DEPRECATED.value
            await self.db.commit()
        else:
            await self.db.delete(relationship)
            await self.db.commit()
        return True

    async def add_entity_alias(self, data: EntityAliasCreate) -> EntityAliasResponse:
        entity = await self.db.get(EntityModel, data.entity_id)
        if not entity:
            raise ValueError(f"Entity {data.entity_id} not found")

        existing = await self.db.scalar(
            select(EntityAliasModel).where(
                EntityAliasModel.entity_id == data.entity_id,
                EntityAliasModel.alias == data.alias,
            )
        )
        if existing:
            raise ValueError(f"Alias '{data.alias}' already exists for entity {data.entity_id}")

        alias = EntityAliasModel(
            entity_id=data.entity_id,
            alias=data.alias,
            alias_type=data.alias_type.value,
        )
        self.db.add(alias)
        await self.db.commit()
        await self.db.refresh(alias)
        return self._serialize_alias(alias)

    async def list_entity_aliases(self, entity_id: uuid.UUID) -> EntityAliasListResponse:
        result = await self.db.execute(
            select(EntityAliasModel)
            .where(EntityAliasModel.entity_id == entity_id)
            .order_by(EntityAliasModel.created_at.asc())
        )
        aliases = list(result.scalars().all())
        return EntityAliasListResponse(
            aliases=[self._serialize_alias(alias) for alias in aliases],
            total=len(aliases),
        )

    async def list_canonicalization_records(
        self,
        workspace_id: uuid.UUID,
        mention_id: uuid.UUID | None = None,
        canonical_entity_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> EntityCanonicalizationRecordListResponse:
        query = select(EntityCanonicalizationRecordModel).where(
            EntityCanonicalizationRecordModel.workspace_id == workspace_id
        )
        if mention_id:
            query = query.where(EntityCanonicalizationRecordModel.mention_id == mention_id)
        if canonical_entity_id:
            query = query.where(EntityCanonicalizationRecordModel.canonical_entity_id == canonical_entity_id)

        result = await self.db.execute(
            query.order_by(EntityCanonicalizationRecordModel.created_at.desc()).offset(offset).limit(limit)
        )
        records = list(result.scalars().all())
        return EntityCanonicalizationRecordListResponse(
            records=[self._serialize_canonicalization_record(record) for record in records],
            total=len(records),
        )

    async def query_graph(self, data: GraphQueryRequest) -> GraphQueryResultResponse:
        if data.query_type == GraphQueryType.ENTITY_LOOKUP:
            entities = await self.search_entities(
                EntitySearchParams(
                    workspace_id=data.workspace_id,
                    query=data.query,
                    entity_type=data.entity_type,
                    limit=data.limit,
                )
            )
            return GraphQueryResultResponse(
                query_type=data.query_type,
                entities=[entity.model_dump(mode="json") for entity in entities.entities],
                total=entities.total,
            )

        if data.query_type == GraphQueryType.RELATIONSHIP_LOOKUP:
            relationships = await self.list_relationships(
                workspace_id=data.workspace_id,
                entity_id=data.entity_id,
                predicate=data.predicate,
                limit=data.limit,
            )
            return GraphQueryResultResponse(
                query_type=data.query_type,
                relationships=[relationship.model_dump(mode="json") for relationship in relationships.relationships],
                total=relationships.total,
            )

        if data.query_type == GraphQueryType.NEIGHBORHOOD:
            if not data.entity_id:
                raise ValueError("entity_id is required for neighborhood queries")
            neighbors = await self.traversal.get_entity_neighbors(
                entity_id=data.entity_id,
                max_depth=data.max_depth,
                limit=data.limit,
            )
            return GraphQueryResultResponse(
                query_type=data.query_type,
                entities=[neighbor.model_dump(mode="json") for neighbor in neighbors.neighbors],
                total=neighbors.total,
            )

        if data.query_type == GraphQueryType.PATH:
            from_entity_id = data.from_entity_id or data.entity_id
            if not from_entity_id or not data.to_entity_id:
                raise ValueError("from_entity_id and to_entity_id are required for path queries")
            path = await self.traversal.find_path(
                from_entity_id=from_entity_id,
                to_entity_id=data.to_entity_id,
                max_depth=data.max_depth,
            )
            return GraphQueryResultResponse(
                query_type=data.query_type,
                path=[hop.model_dump(mode="json") for hop in path.hops],
                total=path.total_hops,
            )

        if data.query_type == GraphQueryType.PROVENANCE:
            if data.entity_id:
                provenance = await self.provenance.get_entity_provenance(data.entity_id)
            elif data.relationship_id:
                provenance = await self.provenance.get_relationship_provenance(data.relationship_id)
            else:
                raise ValueError("entity_id or relationship_id is required for provenance queries")
            return GraphQueryResultResponse(
                query_type=data.query_type,
                provenance=[link.model_dump(mode="json") for link in provenance.links],
                total=provenance.total,
            )

        raise ValueError(f"Unsupported graph query type: {data.query_type}")

    def _serialize_entity(self, entity: EntityModel) -> EntityResponse:
        return EntityResponse(
            id=entity.id,
            workspace_id=entity.workspace_id,
            canonical_name=entity.canonical_name,
            normalized_key=entity.normalized_key,
            entity_type=EntityType(entity.entity_type),
            description=entity.description,
            attributes=entity.attributes_json,
            status=EntityStatus(entity.status),
            confidence=entity.confidence,
            source_count=entity.source_count,
            last_seen_at=entity.last_seen_at,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
        )

    def _serialize_relationship(self, relationship: RelationshipModel) -> RelationshipResponse:
        return RelationshipResponse(
            id=relationship.id,
            workspace_id=relationship.workspace_id,
            subject_entity_id=relationship.subject_entity_id,
            object_entity_id=relationship.object_entity_id,
            predicate=relationship.predicate,
            relationship_type=relationship.relationship_type,
            attributes=relationship.attributes_json,
            status=RelationshipStatus(relationship.status),
            confidence=relationship.confidence,
            support_count=relationship.support_count,
            directionality=RelationshipDirectionality(relationship.directionality),
            created_at=relationship.created_at,
            updated_at=relationship.updated_at,
        )

    def _serialize_alias(self, alias: EntityAliasModel) -> EntityAliasResponse:
        return EntityAliasResponse(
            id=alias.id,
            entity_id=alias.entity_id,
            alias=alias.alias,
            alias_type=AliasType(alias.alias_type),
            source_mention_id=alias.source_mention_id,
            created_at=alias.created_at,
        )

    def _serialize_canonicalization_record(
        self,
        record: EntityCanonicalizationRecordModel,
    ) -> EntityCanonicalizationRecordResponse:
        return EntityCanonicalizationRecordResponse(
            id=record.id,
            workspace_id=record.workspace_id,
            mention_id=record.mention_id,
            canonical_entity_id=record.canonical_entity_id,
            canonicalization_state=record.canonicalization_state,
            match_type=record.match_type,
            match_confidence=record.match_confidence,
            rationale=record.rationale,
            created_at=record.created_at,
        )

    def _source_type_value(self, value: str | SourceType) -> str:
        return value.value if isinstance(value, SourceType) else str(value)
