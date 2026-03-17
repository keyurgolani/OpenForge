"""
Graph extraction pipeline.

Queues extraction jobs, extracts entity/relationship mentions, canonicalizes
them, and persists durable extraction results.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    EntityMentionModel,
    EvidencePacketModel,
    GraphExtractionJobModel,
    GraphExtractionResultModel,
    Knowledge,
    RelationshipMentionModel,
)
from .normalization import GraphNormalizationService
from .schemas import (
    ExtractionJobResponse,
    GraphExtractionResultResponse,
)
from .types import (
    EntityMentionData,
    EntityType,
    ExtractionJobStatus,
    ExtractionMethod,
    ExtractionResult,
    MentionResolutionStatus,
    RelationshipMentionData,
    SourceType,
)

logger = logging.getLogger(__name__)


ENTITY_EXTRACTION_PROMPT = """Extract all entities (people, organizations, concepts, tools, etc.) from the following text.

For each entity, provide:
- mention_text: The exact text of the entity mention
- entity_type: One of: person, organization, project, document, concept, tool, location, event, artifact, generic
- context_snippet: A short context (up to 200 chars) around the mention
- confidence: How confident you are this is a real entity (0.0-1.0)

Text to analyze:
{text}

Respond with a JSON array of entities. Example:
[{{"mention_text": "OpenAI", "entity_type": "organization", "context_snippet": "...developed by OpenAI...", "confidence": 0.95}}]
"""

RELATIONSHIP_EXTRACTION_PROMPT = """Extract all relationships between entities from the following text.

For each relationship, provide:
- subject_text: The subject entity text
- object_text: The object entity text
- predicate: The relationship (e.g., "works_for", "located_in", "created_by", "related_to")
- source_snippet: A short context (up to 300 chars) showing the relationship
- confidence: How confident you are in this relationship (0.0-1.0)

Text to analyze:
{text}

Respond with a JSON array of relationships. Example:
[{{"subject_text": "John", "object_text": "OpenAI", "predicate": "works_for", "source_snippet": "John works at OpenAI as an engineer", "confidence": 0.9}}]
"""


class GraphExtractionService:
    """
    Manages graph extraction jobs and durable extraction results.
    """

    def __init__(self, db: AsyncSession, llm_service=None):
        self.db = db
        self.llm_service = llm_service
        self.normalization = GraphNormalizationService(db)

    async def queue_extraction_job(
        self,
        workspace_id: uuid.UUID,
        source_type: str | SourceType,
        source_id: uuid.UUID,
        metadata: dict[str, Any] | None = None,
    ) -> ExtractionJobResponse:
        job = GraphExtractionJobModel(
            workspace_id=workspace_id,
            source_type=self._source_type_value(source_type),
            source_id=source_id,
            status=ExtractionJobStatus.QUEUED.value,
            metadata_json=metadata or {},
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        logger.info("Queued graph extraction job %s for %s/%s", job.id, job.source_type, job.source_id)
        return self._serialize_job(job)

    async def process_extraction_job(
        self,
        job_id: uuid.UUID,
        llm_provider_id: uuid.UUID | None = None,
    ) -> GraphExtractionResultResponse:
        job = await self.db.get(GraphExtractionJobModel, job_id)
        if not job:
            raise ValueError(f"Graph extraction job {job_id} not found")

        job.status = ExtractionJobStatus.RUNNING.value
        job.error_message = None
        await self.db.commit()

        try:
            content = await self._load_source_content(job.source_type, job.source_id)
            if not content:
                raise ValueError(f"Source content not found: {job.source_type}/{job.source_id}")

            result = await self._run_extraction(
                workspace_id=job.workspace_id,
                job_id=job_id,
                content=content,
                source_type=job.source_type,
                source_id=job.source_id,
                llm_provider_id=llm_provider_id,
            )

            normalization_result = await self.normalization.normalize_extraction_job(job_id)
            result.canonicalization_records = list(normalization_result.records)
            result.notes.append(
                "Normalization summary: "
                f"{normalization_result.resolved_count} resolved, "
                f"{normalization_result.new_created_count} new, "
                f"{normalization_result.review_needed_count} review_needed."
            )

            persisted_result = await self._upsert_extraction_result(job.workspace_id, job_id, result)

            job.entity_count = len(result.entity_mentions)
            job.relationship_count = len(result.relationship_mentions)
            job.status = (
                ExtractionJobStatus.PARTIAL.value if result.errors else ExtractionJobStatus.COMPLETED.value
            )
            job.error_message = "\n".join(result.errors) if result.errors else None

            await self.db.commit()
            await self.db.refresh(persisted_result)
            await self.db.refresh(job)

            logger.info(
                "Completed graph extraction job %s with %s entities, %s relationships, %s canonicalizations",
                job_id,
                job.entity_count,
                job.relationship_count,
                len(result.canonicalization_records),
            )
            return self._serialize_result(persisted_result)
        except Exception as exc:
            job.status = ExtractionJobStatus.FAILED.value
            job.error_message = str(exc)
            await self.db.commit()
            logger.exception("Graph extraction job %s failed", job_id)
            raise

    async def get_extraction_job(self, job_id: uuid.UUID) -> ExtractionJobResponse | None:
        job = await self.db.get(GraphExtractionJobModel, job_id)
        if not job:
            return None
        return self._serialize_job(job)

    async def list_extraction_jobs(
        self,
        workspace_id: uuid.UUID,
        status: str | ExtractionJobStatus | None = None,
        source_type: str | SourceType | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ExtractionJobResponse], int]:
        query = select(GraphExtractionJobModel).where(GraphExtractionJobModel.workspace_id == workspace_id)

        if status:
            status_value = status.value if isinstance(status, ExtractionJobStatus) else str(status)
            query = query.where(GraphExtractionJobModel.status == status_value)
        if source_type:
            query = query.where(GraphExtractionJobModel.source_type == self._source_type_value(source_type))

        total = await self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self.db.execute(
            query.order_by(GraphExtractionJobModel.created_at.desc()).offset(offset).limit(limit)
        )
        jobs = list(result.scalars().all())
        return [self._serialize_job(job) for job in jobs], total

    async def get_extraction_result(self, job_id: uuid.UUID) -> GraphExtractionResultResponse | None:
        result_model = await self.db.scalar(
            select(GraphExtractionResultModel).where(GraphExtractionResultModel.extraction_job_id == job_id)
        )
        if not result_model:
            return None
        return self._serialize_result(result_model)

    async def list_extraction_results(
        self,
        workspace_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[GraphExtractionResultResponse], int]:
        query = select(GraphExtractionResultModel).where(GraphExtractionResultModel.workspace_id == workspace_id)
        total = await self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self.db.execute(
            query.order_by(GraphExtractionResultModel.created_at.desc()).offset(offset).limit(limit)
        )
        models = list(result.scalars().all())
        return [self._serialize_result(model) for model in models], total

    async def _load_source_content(self, source_type: str, source_id: uuid.UUID) -> str | None:
        source_kind = self._source_type_value(source_type)

        if source_kind == SourceType.KNOWLEDGE.value:
            knowledge = await self.db.get(Knowledge, source_id)
            if knowledge:
                return knowledge.content

        if source_kind == SourceType.EVIDENCE_PACKET.value:
            packet = await self.db.get(EvidencePacketModel, source_id)
            if packet and packet.items_json:
                items = packet.items_json if isinstance(packet.items_json, list) else []
                return "\n\n".join(item.get("content", "") for item in items if item.get("content"))

        if source_kind == SourceType.CHUNK.value:
            logger.warning("Chunk graph extraction is not yet connected to a chunk store: %s", source_id)
            return None

        if source_kind == SourceType.DOCUMENT.value:
            logger.warning("Document graph extraction is not yet connected to a document store: %s", source_id)
            return None

        if source_kind == SourceType.EVIDENCE_ITEM.value:
            logger.warning("Evidence-item graph extraction is not yet connected to item storage: %s", source_id)
            return None

        return None

    async def _run_extraction(
        self,
        workspace_id: uuid.UUID,
        job_id: uuid.UUID,
        content: str,
        source_type: str,
        source_id: uuid.UUID,
        llm_provider_id: uuid.UUID | None = None,
    ) -> ExtractionResult:
        result = ExtractionResult()

        entity_mentions_data = await self._extract_entities(content=content, llm_provider_id=llm_provider_id)
        entity_mention_map: dict[str, uuid.UUID] = {}

        for mention_data in entity_mentions_data:
            mention = EntityMentionModel(
                workspace_id=workspace_id,
                extraction_job_id=job_id,
                mention_text=mention_data.mention_text,
                entity_type=mention_data.entity_type.value,
                context_snippet=mention_data.context_snippet,
                source_type=source_type,
                source_id=source_id,
                extraction_method=ExtractionMethod.LLM.value if self.llm_service else ExtractionMethod.REGEX.value,
                confidence=mention_data.confidence,
                resolution_status=MentionResolutionStatus.UNRESOLVED.value,
            )
            self.db.add(mention)
            await self.db.flush()
            entity_mention_map[mention_data.mention_text.lower().strip()] = mention.id
            result.entity_mentions.append(mention_data)

        relationship_mentions_data = await self._extract_relationships(content=content, llm_provider_id=llm_provider_id)
        for relationship_data in relationship_mentions_data:
            subject_mention_id = entity_mention_map.get(relationship_data.subject_text.lower().strip())
            object_mention_id = entity_mention_map.get(relationship_data.object_text.lower().strip())
            if not subject_mention_id or not object_mention_id:
                result.notes.append(
                    "Skipped relationship mention because extracted entity mentions were missing for "
                    f"{relationship_data.subject_text!r} -> {relationship_data.object_text!r}."
                )
                continue

            mention = RelationshipMentionModel(
                workspace_id=workspace_id,
                extraction_job_id=job_id,
                canonical_relationship_id=None,
                subject_mention_id=subject_mention_id,
                object_mention_id=object_mention_id,
                predicate=relationship_data.predicate,
                source_snippet=relationship_data.source_snippet,
                source_type=source_type,
                source_id=source_id,
                extraction_method=ExtractionMethod.LLM.value,
                confidence=relationship_data.confidence,
                resolution_status=MentionResolutionStatus.UNRESOLVED.value,
            )
            self.db.add(mention)
            result.relationship_mentions.append(relationship_data)

        await self.db.flush()
        return result

    async def _extract_entities(
        self,
        content: str,
        llm_provider_id: uuid.UUID | None = None,
    ) -> list[EntityMentionData]:
        if not self.llm_service:
            return self._regex_entity_extraction(content)

        try:
            prompt = ENTITY_EXTRACTION_PROMPT.format(text=content[:8000])
            response = await self.llm_service.generate(prompt=prompt, provider_id=llm_provider_id)
            entities_data = self._parse_json_response(response.content)
            if not entities_data:
                return []

            return [
                EntityMentionData(
                    mention_text=entity.get("mention_text", ""),
                    entity_type=self._coerce_entity_type(entity.get("entity_type")),
                    context_snippet=entity.get("context_snippet"),
                    confidence=entity.get("confidence", 0.8),
                )
                for entity in entities_data
                if entity.get("mention_text")
            ]
        except Exception as exc:
            logger.error("LLM entity extraction failed: %s", exc)
            return self._regex_entity_extraction(content)

    async def _extract_relationships(
        self,
        content: str,
        llm_provider_id: uuid.UUID | None = None,
    ) -> list[RelationshipMentionData]:
        if not self.llm_service:
            return []

        try:
            prompt = RELATIONSHIP_EXTRACTION_PROMPT.format(text=content[:8000])
            response = await self.llm_service.generate(prompt=prompt, provider_id=llm_provider_id)
            relationships_data = self._parse_json_response(response.content)
            if not relationships_data:
                return []

            return [
                RelationshipMentionData(
                    subject_text=relationship.get("subject_text", ""),
                    object_text=relationship.get("object_text", ""),
                    predicate=relationship.get("predicate", "related_to"),
                    source_snippet=relationship.get("source_snippet"),
                    confidence=relationship.get("confidence", 0.7),
                )
                for relationship in relationships_data
                if relationship.get("subject_text") and relationship.get("object_text")
            ]
        except Exception as exc:
            logger.error("LLM relationship extraction failed: %s", exc)
            return []

    def _regex_entity_extraction(self, content: str) -> list[EntityMentionData]:
        entities: list[EntityMentionData] = []
        patterns = {
            EntityType.PERSON: r"\b[A-Z][a-z]+ [A-Z][a-z]+\b",
            EntityType.ORGANIZATION: r"\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\b",
        }

        seen: set[str] = set()
        for entity_type, pattern in patterns.items():
            for match in re.finditer(pattern, content):
                text = match.group()
                normalized_text = text.lower()
                if normalized_text in seen or len(text) <= 3:
                    continue

                seen.add(normalized_text)
                start = max(0, match.start() - 50)
                end = min(len(content), match.end() + 50)
                context = content[start:end]
                entities.append(
                    EntityMentionData(
                        mention_text=text,
                        entity_type=entity_type,
                        context_snippet=context,
                        confidence=0.5,
                    )
                )

        return entities[:50]

    def _parse_json_response(self, content: str) -> list[dict[str, Any]] | None:
        try:
            parsed = json.loads(content)
            return parsed if isinstance(parsed, list) else None
        except json.JSONDecodeError as e:
            logger.warning("Graph extraction step failed: %s", e)

        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
        if json_match:
            try:
                parsed = json.loads(json_match.group(1))
                return parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError as e:
                logger.warning("Graph extraction step failed: %s", e)

        array_match = re.search(r"\[[\s\S]*\]", content)
        if array_match:
            try:
                parsed = json.loads(array_match.group())
                return parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError as e:
                logger.warning("Graph extraction step failed: %s", e)

        return None

    async def _upsert_extraction_result(
        self,
        workspace_id: uuid.UUID,
        job_id: uuid.UUID,
        result: ExtractionResult,
    ) -> GraphExtractionResultModel:
        result_model = await self.db.scalar(
            select(GraphExtractionResultModel).where(GraphExtractionResultModel.extraction_job_id == job_id)
        )
        payload = {
            "entity_mentions_json": [item.model_dump(mode="json") for item in result.entity_mentions],
            "relationship_mentions_json": [item.model_dump(mode="json") for item in result.relationship_mentions],
            "canonicalization_records_json": [item.model_dump(mode="json") for item in result.canonicalization_records],
            "errors_json": list(result.errors),
            "notes_json": list(result.notes),
        }

        if result_model:
            result_model.entity_mentions_json = payload["entity_mentions_json"]
            result_model.relationship_mentions_json = payload["relationship_mentions_json"]
            result_model.canonicalization_records_json = payload["canonicalization_records_json"]
            result_model.errors_json = payload["errors_json"]
            result_model.notes_json = payload["notes_json"]
        else:
            result_model = GraphExtractionResultModel(
                workspace_id=workspace_id,
                extraction_job_id=job_id,
                **payload,
            )
            self.db.add(result_model)

        await self.db.flush()
        return result_model

    def _serialize_job(self, job: GraphExtractionJobModel) -> ExtractionJobResponse:
        return ExtractionJobResponse(
            id=job.id,
            workspace_id=job.workspace_id,
            source_type=SourceType(job.source_type),
            source_id=job.source_id,
            status=ExtractionJobStatus(job.status),
            entity_count=job.entity_count,
            relationship_count=job.relationship_count,
            error_message=job.error_message,
            metadata=job.metadata_json,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    def _serialize_result(self, result_model: GraphExtractionResultModel) -> GraphExtractionResultResponse:
        return GraphExtractionResultResponse(
            id=result_model.id,
            workspace_id=result_model.workspace_id,
            extraction_job_id=result_model.extraction_job_id,
            entity_mentions=result_model.entity_mentions_json,
            relationship_mentions=result_model.relationship_mentions_json,
            canonicalization_records=result_model.canonicalization_records_json,
            errors=result_model.errors_json,
            notes=result_model.notes_json,
            created_at=result_model.created_at,
            updated_at=result_model.updated_at,
        )

    def _coerce_entity_type(self, value: Any) -> EntityType:
        if isinstance(value, EntityType):
            return value
        if isinstance(value, str):
            try:
                return EntityType(value)
            except ValueError:
                return EntityType.GENERIC
        return EntityType.GENERIC

    def _source_type_value(self, source_type: str | SourceType) -> str:
        return source_type.value if isinstance(source_type, SourceType) else str(source_type)
