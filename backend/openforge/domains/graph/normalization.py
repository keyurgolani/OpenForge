"""
Graph normalization and canonicalization.

Normalizes entity and relationship mentions into canonical graph objects while
preserving durable canonicalization records and provenance.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    EntityAliasModel,
    EntityCanonicalizationRecordModel,
    EntityMentionModel,
    EntityModel,
    GraphExtractionJobModel,
    GraphProvenanceLinkModel,
    RelationshipMentionModel,
    RelationshipModel,
)
from .schemas import EntityResponse, RelationshipResponse
from .types import (
    AliasType,
    CanonicalizationRecord,
    CanonicalizationState,
    EntityStatus,
    EntityType,
    GraphObjectType,
    MentionResolutionStatus,
    NormalizationResult,
    RelationshipDirectionality,
    RelationshipStatus,
)

logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class GraphNormalizationService:
    """
    Normalizes entity and relationship mentions into canonical objects.
    """

    EXACT_MATCH_THRESHOLD = 1.0
    ALIAS_MATCH_THRESHOLD = 0.95
    CASE_INSENSITIVE_THRESHOLD = 0.85

    def __init__(self, db: AsyncSession):
        self.db = db

    def generate_normalized_key(self, text: str, entity_type: str) -> str:
        """Generate a normalized key for entity matching."""
        normalized = text.lower().strip()
        normalized = re.sub(r"\s+", "_", normalized)
        normalized = re.sub(r"[^a-z0-9_]", "", normalized)
        return f"{entity_type}:{normalized}"

    def normalize_predicate(self, predicate: str) -> str:
        """Normalize relationship predicates into a stable, queryable key."""
        normalized = predicate.lower().strip()
        normalized = re.sub(r"\s+", "_", normalized)
        normalized = re.sub(r"[^a-z0-9_]", "", normalized)
        return normalized or "related_to"

    async def normalize_extraction_job(self, job_id: uuid.UUID) -> NormalizationResult:
        """
        Resolve the mentions emitted by an extraction job into canonical objects.
        """
        job = await self.db.get(GraphExtractionJobModel, job_id)
        if not job:
            raise ValueError(f"Graph extraction job {job_id} not found")

        entity_mentions = await self._get_entity_mentions(job_id)
        relationship_mentions = await self._get_relationship_mentions(job_id)

        result = NormalizationResult(total_mentions=len(entity_mentions))
        mention_by_id = {mention.id: mention for mention in entity_mentions}

        for mention in entity_mentions:
            record = await self._canonicalize_entity_mention(job.workspace_id, mention)
            result.records.append(record)
            if record.state == CanonicalizationState.CREATED_NEW:
                result.new_created_count += 1
            elif record.state == CanonicalizationState.REVIEW_NEEDED:
                result.review_needed_count += 1
            else:
                result.resolved_count += 1

        relationship_review_needed = await self._canonicalize_relationship_mentions(
            workspace_id=job.workspace_id,
            relationship_mentions=relationship_mentions,
            mention_by_id=mention_by_id,
        )
        result.review_needed_count += relationship_review_needed

        await self.db.flush()
        return result

    async def find_matching_entity(
        self,
        workspace_id: uuid.UUID,
        mention: EntityMentionModel,
    ) -> tuple[EntityModel, str, float] | None:
        """
        Find a matching entity for a mention.

        Matching rules:
        1. Exact normalized key
        2. Alias
        3. Case-insensitive canonical name
        """
        normalized_key = self.generate_normalized_key(mention.mention_text, mention.entity_type)

        entity = await self.db.scalar(
            select(EntityModel).where(
                EntityModel.workspace_id == workspace_id,
                EntityModel.normalized_key == normalized_key,
                EntityModel.status == EntityStatus.ACTIVE.value,
            )
        )
        if entity:
            return entity, "exact_key", self.EXACT_MATCH_THRESHOLD

        alias = await self.db.scalar(
            select(EntityAliasModel).where(EntityAliasModel.alias == mention.mention_text)
        )
        if alias:
            entity = await self.db.get(EntityModel, alias.entity_id)
            if entity and entity.workspace_id == workspace_id and entity.status == EntityStatus.ACTIVE.value:
                return entity, "alias", self.ALIAS_MATCH_THRESHOLD

        entity = await self.db.scalar(
            select(EntityModel).where(
                EntityModel.workspace_id == workspace_id,
                EntityModel.canonical_name.ilike(mention.mention_text),
                EntityModel.status == EntityStatus.ACTIVE.value,
            )
        )
        if entity:
            return entity, "case_insensitive", self.CASE_INSENSITIVE_THRESHOLD

        return None

    async def create_entity_from_mention(
        self,
        workspace_id: uuid.UUID,
        mention: EntityMentionModel,
    ) -> EntityModel:
        """Create a new canonical entity from a source mention."""
        normalized_key = self.generate_normalized_key(mention.mention_text, mention.entity_type)
        entity = EntityModel(
            workspace_id=workspace_id,
            canonical_name=mention.mention_text,
            normalized_key=normalized_key,
            entity_type=mention.entity_type,
            description=None,
            attributes_json={},
            status=EntityStatus.ACTIVE.value,
            confidence=mention.confidence,
            source_count=1,
            last_seen_at=now_utc(),
        )
        self.db.add(entity)
        await self.db.flush()

        mention.canonical_entity_id = entity.id
        mention.resolution_status = MentionResolutionStatus.RESOLVED.value
        await self._ensure_entity_provenance(entity, mention)

        logger.info("Created new entity '%s' from mention %s", entity.canonical_name, mention.id)
        return entity

    async def _canonicalize_entity_mention(
        self,
        workspace_id: uuid.UUID,
        mention: EntityMentionModel,
    ) -> CanonicalizationRecord:
        match = await self.find_matching_entity(workspace_id, mention)
        if match:
            entity, match_type, match_confidence = match
            mention.canonical_entity_id = entity.id
            mention.resolution_status = MentionResolutionStatus.RESOLVED.value
            entity.source_count = (entity.source_count or 0) + 1
            entity.last_seen_at = now_utc()
            entity.confidence = max(entity.confidence or 0.0, mention.confidence)
            state = CanonicalizationState.RESOLVED
            rationale = (
                f"Matched mention '{mention.mention_text}' to existing entity "
                f"'{entity.canonical_name}' via {match_type}."
            )
            await self._ensure_entity_alias(entity, mention)
            await self._ensure_entity_provenance(entity, mention)
        else:
            entity = await self.create_entity_from_mention(workspace_id, mention)
            match_type = "new_entity"
            match_confidence = mention.confidence
            state = CanonicalizationState.CREATED_NEW
            rationale = (
                f"Created canonical entity '{entity.canonical_name}' from unresolved "
                f"mention '{mention.mention_text}'."
            )

        record_model = EntityCanonicalizationRecordModel(
            workspace_id=workspace_id,
            mention_id=mention.id,
            canonical_entity_id=entity.id,
            canonicalization_state=state.value,
            match_type=match_type,
            match_confidence=match_confidence,
            rationale=rationale,
        )
        self.db.add(record_model)
        await self.db.flush()

        return CanonicalizationRecord(
            state=state,
            mention_id=mention.id,
            canonical_id=entity.id,
            match_type=match_type,
            match_confidence=match_confidence,
            rationale=rationale,
            created_at=record_model.created_at or now_utc(),
        )

    async def _canonicalize_relationship_mentions(
        self,
        workspace_id: uuid.UUID,
        relationship_mentions: list[RelationshipMentionModel],
        mention_by_id: dict[uuid.UUID, EntityMentionModel],
    ) -> int:
        review_needed_count = 0

        for mention in relationship_mentions:
            subject_mention = mention_by_id.get(mention.subject_mention_id)
            object_mention = mention_by_id.get(mention.object_mention_id)

            if not subject_mention or not object_mention:
                mention.resolution_status = MentionResolutionStatus.REVIEW_NEEDED.value
                review_needed_count += 1
                continue

            if not subject_mention.canonical_entity_id or not object_mention.canonical_entity_id:
                mention.resolution_status = MentionResolutionStatus.REVIEW_NEEDED.value
                review_needed_count += 1
                continue

            relationship = await self._find_matching_relationship(
                workspace_id=workspace_id,
                subject_entity_id=subject_mention.canonical_entity_id,
                object_entity_id=object_mention.canonical_entity_id,
                predicate=mention.predicate,
            )

            if relationship:
                relationship.support_count = (relationship.support_count or 0) + 1
                relationship.confidence = max(relationship.confidence or 0.0, mention.confidence)
            else:
                relationship = RelationshipModel(
                    workspace_id=workspace_id,
                    subject_entity_id=subject_mention.canonical_entity_id,
                    object_entity_id=object_mention.canonical_entity_id,
                    predicate=self.normalize_predicate(mention.predicate),
                    relationship_type="extracted",
                    attributes_json={},
                    status=RelationshipStatus.ACTIVE.value,
                    confidence=mention.confidence,
                    support_count=1,
                    directionality=RelationshipDirectionality.DIRECTED.value,
                )
                self.db.add(relationship)
                await self.db.flush()

            mention.canonical_relationship_id = relationship.id
            mention.resolution_status = MentionResolutionStatus.RESOLVED.value
            await self._ensure_relationship_provenance(relationship, mention)

        return review_needed_count

    async def _find_matching_relationship(
        self,
        workspace_id: uuid.UUID,
        subject_entity_id: uuid.UUID,
        object_entity_id: uuid.UUID,
        predicate: str,
    ) -> RelationshipModel | None:
        return await self.db.scalar(
            select(RelationshipModel).where(
                RelationshipModel.workspace_id == workspace_id,
                RelationshipModel.subject_entity_id == subject_entity_id,
                RelationshipModel.object_entity_id == object_entity_id,
                RelationshipModel.predicate == self.normalize_predicate(predicate),
                RelationshipModel.status == RelationshipStatus.ACTIVE.value,
            )
        )

    async def _get_entity_mentions(self, job_id: uuid.UUID) -> list[EntityMentionModel]:
        result = await self.db.execute(
            select(EntityMentionModel)
            .where(EntityMentionModel.extraction_job_id == job_id)
            .order_by(EntityMentionModel.created_at.asc())
        )
        return list(result.scalars().all())

    async def _get_relationship_mentions(self, job_id: uuid.UUID) -> list[RelationshipMentionModel]:
        result = await self.db.execute(
            select(RelationshipMentionModel)
            .where(RelationshipMentionModel.extraction_job_id == job_id)
            .order_by(RelationshipMentionModel.created_at.asc())
        )
        return list(result.scalars().all())

    async def _ensure_entity_alias(self, entity: EntityModel, mention: EntityMentionModel) -> None:
        if mention.mention_text == entity.canonical_name:
            return

        existing = await self.db.scalar(
            select(EntityAliasModel).where(
                EntityAliasModel.entity_id == entity.id,
                EntityAliasModel.alias == mention.mention_text,
            )
        )
        if existing:
            return

        self.db.add(
            EntityAliasModel(
                entity_id=entity.id,
                alias=mention.mention_text,
                alias_type=AliasType.ALTERNATE_NAME.value,
                source_mention_id=mention.id,
            )
        )

    async def _ensure_entity_provenance(self, entity: EntityModel, mention: EntityMentionModel) -> None:
        existing = await self.db.scalar(
            select(GraphProvenanceLinkModel).where(
                GraphProvenanceLinkModel.graph_object_type == GraphObjectType.ENTITY.value,
                GraphProvenanceLinkModel.graph_object_id == entity.id,
                GraphProvenanceLinkModel.source_type == mention.source_type,
                GraphProvenanceLinkModel.source_id == mention.source_id,
            )
        )
        if existing:
            return

        self.db.add(
            GraphProvenanceLinkModel(
                workspace_id=entity.workspace_id,
                graph_object_type=GraphObjectType.ENTITY.value,
                graph_object_id=entity.id,
                source_type=mention.source_type,
                source_id=mention.source_id,
                excerpt=mention.context_snippet,
                confidence=mention.confidence,
                extraction_method=mention.extraction_method,
            )
        )

    async def _ensure_relationship_provenance(
        self,
        relationship: RelationshipModel,
        mention: RelationshipMentionModel,
    ) -> None:
        existing = await self.db.scalar(
            select(GraphProvenanceLinkModel).where(
                GraphProvenanceLinkModel.graph_object_type == GraphObjectType.RELATIONSHIP.value,
                GraphProvenanceLinkModel.graph_object_id == relationship.id,
                GraphProvenanceLinkModel.source_type == mention.source_type,
                GraphProvenanceLinkModel.source_id == mention.source_id,
            )
        )
        if existing:
            return

        self.db.add(
            GraphProvenanceLinkModel(
                workspace_id=relationship.workspace_id,
                graph_object_type=GraphObjectType.RELATIONSHIP.value,
                graph_object_id=relationship.id,
                source_type=mention.source_type,
                source_id=mention.source_id,
                excerpt=mention.source_snippet,
                confidence=mention.confidence,
                extraction_method=mention.extraction_method,
            )
        )

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
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            last_seen_at=entity.last_seen_at,
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
