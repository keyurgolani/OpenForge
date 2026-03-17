from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import EntityMentionModel, EntityModel, GraphProvenanceLinkModel
from openforge.domains.graph.normalization import GraphNormalizationService
from openforge.domains.graph.schemas import EntityCreate, RelationshipCreate
from openforge.domains.graph.service import GraphService
from openforge.domains.graph.types import (
    EntityStatus,
    EntityType,
    MentionResolutionStatus,
    RelationshipDirectionality,
)

from ._helpers import FakeAsyncSession


@pytest.mark.asyncio
async def test_create_entity_requires_provenance() -> None:
    db = FakeAsyncSession()
    service = GraphService(db)

    with pytest.raises(ValueError, match="provenance"):
        await service.create_entity(
            EntityCreate(
                workspace_id=uuid4(),
                canonical_name="OpenForge",
                entity_type=EntityType.ORGANIZATION,
            )
        )


@pytest.mark.asyncio
async def test_create_relationship_requires_provenance() -> None:
    workspace_id = uuid4()
    subject = EntityModel(
        id=uuid4(),
        workspace_id=workspace_id,
        canonical_name="Alice",
        normalized_key="person:alice",
        entity_type=EntityType.PERSON.value,
        status=EntityStatus.ACTIVE.value,
    )
    obj = EntityModel(
        id=uuid4(),
        workspace_id=workspace_id,
        canonical_name="OpenForge",
        normalized_key="organization:openforge",
        entity_type=EntityType.ORGANIZATION.value,
        status=EntityStatus.ACTIVE.value,
    )
    db = FakeAsyncSession(
        objects={
            (EntityModel, subject.id): subject,
            (EntityModel, obj.id): obj,
        }
    )
    service = GraphService(db)

    with pytest.raises(ValueError, match="provenance"):
        await service.create_relationship(
            RelationshipCreate(
                workspace_id=workspace_id,
                subject_entity_id=subject.id,
                object_entity_id=obj.id,
                predicate="works_on",
                directionality=RelationshipDirectionality.DIRECTED,
            )
        )


@pytest.mark.asyncio
async def test_create_entity_from_mention_creates_provenance_and_marks_resolution() -> None:
    workspace_id = uuid4()
    mention = EntityMentionModel(
        id=uuid4(),
        workspace_id=workspace_id,
        extraction_job_id=uuid4(),
        mention_text="OpenForge",
        entity_type=EntityType.ORGANIZATION.value,
        context_snippet="OpenForge shipped the graph foundation.",
        source_type="knowledge",
        source_id=uuid4(),
        extraction_method="llm",
        confidence=0.92,
        resolution_status=MentionResolutionStatus.UNRESOLVED.value,
    )
    db = FakeAsyncSession()
    service = GraphNormalizationService(db)

    entity = await service.create_entity_from_mention(workspace_id, mention)

    assert entity.canonical_name == "OpenForge"
    assert entity.normalized_key == "organization:openforge"
    assert entity.entity_type == EntityType.ORGANIZATION.value
    assert entity.status == EntityStatus.ACTIVE.value
    assert entity.confidence == mention.confidence
    assert mention.canonical_entity_id == entity.id
    assert mention.resolution_status == MentionResolutionStatus.RESOLVED.value

    provenance_links = [obj for obj in db.added if isinstance(obj, GraphProvenanceLinkModel)]
    assert len(provenance_links) == 1
    assert provenance_links[0].graph_object_type == "entity"
    assert provenance_links[0].graph_object_id == entity.id
    assert provenance_links[0].source_type == mention.source_type
    assert provenance_links[0].source_id == mention.source_id
