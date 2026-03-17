from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import GraphExtractionJobModel, GraphExtractionResultModel, Knowledge
from openforge.domains.graph.extraction import GraphExtractionService
from openforge.domains.graph.types import (
    CanonicalizationRecord,
    CanonicalizationState,
    EntityMentionData,
    ExtractionJobStatus,
    ExtractionResult,
    NormalizationResult,
    RelationshipMentionData,
    SourceType,
)

from ._helpers import FakeAsyncSession


@pytest.mark.asyncio
async def test_load_source_content_reads_knowledge_documents() -> None:
    source_id = uuid4()
    knowledge = Knowledge(
        id=source_id,
        workspace_id=uuid4(),
        type="note",
        title="Graph Notes",
        content="OpenForge introduced graph provenance in the knowledge graph.",
    )
    db = FakeAsyncSession(objects={(Knowledge, source_id): knowledge})
    service = GraphExtractionService(db)

    content = await service._load_source_content(SourceType.KNOWLEDGE.value, source_id)

    assert content == "OpenForge introduced graph provenance in the knowledge graph."


@pytest.mark.asyncio
async def test_process_extraction_job_persists_durable_result() -> None:
    workspace_id = uuid4()
    job_id = uuid4()
    source_id = uuid4()
    job = GraphExtractionJobModel(
        id=job_id,
        workspace_id=workspace_id,
        source_type=SourceType.KNOWLEDGE.value,
        source_id=source_id,
        status=ExtractionJobStatus.QUEUED.value,
    )
    db = FakeAsyncSession(objects={(GraphExtractionJobModel, job_id): job})
    service = GraphExtractionService(db)

    async def fake_load_source_content(_source_type: str, _source_id):
        return "Alice Example works on OpenForge."

    async def fake_run_extraction(**_kwargs):
        return ExtractionResult(
            entity_mentions=[
                EntityMentionData(mention_text="Alice Example"),
                EntityMentionData(mention_text="OpenForge"),
            ],
            relationship_mentions=[
                RelationshipMentionData(
                    subject_text="Alice Example",
                    object_text="OpenForge",
                    predicate="works_on",
                )
            ],
        )

    async def fake_normalize_extraction_job(_job_id):
        return NormalizationResult(
            total_mentions=2,
            new_created_count=1,
            resolved_count=1,
            records=[
                CanonicalizationRecord(
                    state=CanonicalizationState.RESOLVED,
                    mention_id=uuid4(),
                    canonical_id=uuid4(),
                    match_type="exact_key",
                    match_confidence=1.0,
                    rationale="matched existing entity",
                )
            ],
        )

    service._load_source_content = fake_load_source_content  # type: ignore[method-assign]
    service._run_extraction = fake_run_extraction  # type: ignore[method-assign]
    service.normalization.normalize_extraction_job = fake_normalize_extraction_job  # type: ignore[method-assign]

    result = await service.process_extraction_job(job_id)

    assert result.extraction_job_id == job_id
    assert result.workspace_id == workspace_id
    assert len(result.entity_mentions) == 2
    assert len(result.relationship_mentions) == 1
    assert len(result.canonicalization_records) == 1
    assert any("Normalization summary" in note for note in result.notes)
    assert job.status == ExtractionJobStatus.COMPLETED.value
    assert job.entity_count == 2
    assert job.relationship_count == 1

    persisted_results = [obj for obj in db.added if isinstance(obj, GraphExtractionResultModel)]
    assert len(persisted_results) == 1
    assert persisted_results[0].extraction_job_id == job_id
