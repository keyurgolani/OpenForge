from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import (
    EntityCanonicalizationRecordModel,
    EntityMentionModel,
    GraphExtractionJobModel,
    GraphProvenanceLinkModel,
    RelationshipMentionModel,
    RelationshipModel,
)
from openforge.domains.graph.normalization import GraphNormalizationService
from openforge.domains.graph.types import EntityType, ExtractionJobStatus, MentionResolutionStatus

from ._helpers import FakeAsyncSession, FakeExecuteResult


@pytest.mark.asyncio
async def test_normalize_extraction_job_creates_canonical_records_and_relationships() -> None:
    workspace_id = uuid4()
    job_id = uuid4()

    job = GraphExtractionJobModel(
        id=job_id,
        workspace_id=workspace_id,
        source_type="knowledge",
        source_id=uuid4(),
        status=ExtractionJobStatus.QUEUED.value,
    )
    subject_mention = EntityMentionModel(
        id=uuid4(),
        workspace_id=workspace_id,
        extraction_job_id=job_id,
        mention_text="Alice Example",
        entity_type=EntityType.PERSON.value,
        source_type="knowledge",
        source_id=uuid4(),
        extraction_method="llm",
        confidence=0.91,
        resolution_status=MentionResolutionStatus.UNRESOLVED.value,
    )
    object_mention = EntityMentionModel(
        id=uuid4(),
        workspace_id=workspace_id,
        extraction_job_id=job_id,
        mention_text="OpenForge",
        entity_type=EntityType.ORGANIZATION.value,
        source_type="knowledge",
        source_id=uuid4(),
        extraction_method="llm",
        confidence=0.94,
        resolution_status=MentionResolutionStatus.UNRESOLVED.value,
    )
    relationship_mention = RelationshipMentionModel(
        id=uuid4(),
        workspace_id=workspace_id,
        extraction_job_id=job_id,
        subject_mention_id=subject_mention.id,
        object_mention_id=object_mention.id,
        predicate="works_on",
        source_type="knowledge",
        source_id=uuid4(),
        extraction_method="llm",
        confidence=0.88,
        resolution_status=MentionResolutionStatus.UNRESOLVED.value,
    )

    db = FakeAsyncSession(
        objects={(GraphExtractionJobModel, job_id): job},
        execute_results=[
            FakeExecuteResult([subject_mention, object_mention]),
            FakeExecuteResult([relationship_mention]),
        ],
    )
    service = GraphNormalizationService(db)

    result = await service.normalize_extraction_job(job_id)

    assert result.total_mentions == 2
    assert result.new_created_count == 2
    assert result.resolved_count == 0
    assert len(result.records) == 2
    assert subject_mention.canonical_entity_id is not None
    assert object_mention.canonical_entity_id is not None
    assert relationship_mention.canonical_relationship_id is not None
    assert relationship_mention.resolution_status == MentionResolutionStatus.RESOLVED.value

    canonicalization_records = [
        obj for obj in db.added if isinstance(obj, EntityCanonicalizationRecordModel)
    ]
    relationships = [obj for obj in db.added if isinstance(obj, RelationshipModel)]
    provenance_links = [obj for obj in db.added if isinstance(obj, GraphProvenanceLinkModel)]

    assert len(canonicalization_records) == 2
    assert len(relationships) == 1
    assert relationships[0].predicate == "works_on"
    assert len(provenance_links) == 3
