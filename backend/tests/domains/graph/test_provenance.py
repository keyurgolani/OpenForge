from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import EntityModel, RelationshipModel
from openforge.domains.graph.provenance import ProvenanceService
from openforge.domains.graph.types import EntityStatus, EntityType, GraphObjectType

from ._helpers import FakeAsyncSession, FakeExecuteResult


@pytest.mark.asyncio
async def test_validate_provenance_reports_missing_entities_and_relationships(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()

    entity_with_provenance = EntityModel(
        id=uuid4(),
        workspace_id=workspace_id,
        canonical_name="Entity With Provenance",
        normalized_key="person:entity_with_provenance",
        entity_type=EntityType.PERSON.value,
        status=EntityStatus.ACTIVE.value,
    )
    entity_without_provenance = EntityModel(
        id=uuid4(),
        workspace_id=workspace_id,
        canonical_name="Entity Without Provenance",
        normalized_key="person:entity_without_provenance",
        entity_type=EntityType.PERSON.value,
        status=EntityStatus.ACTIVE.value,
    )
    relationship_with_provenance = RelationshipModel(
        id=uuid4(),
        workspace_id=workspace_id,
        subject_entity_id=entity_with_provenance.id,
        object_entity_id=entity_without_provenance.id,
        predicate="references",
        status=EntityStatus.ACTIVE.value,
    )
    relationship_without_provenance = RelationshipModel(
        id=uuid4(),
        workspace_id=workspace_id,
        subject_entity_id=entity_without_provenance.id,
        object_entity_id=entity_with_provenance.id,
        predicate="depends_on",
        status=EntityStatus.ACTIVE.value,
    )

    db = FakeAsyncSession(
        execute_results=[
            FakeExecuteResult([entity_with_provenance, entity_without_provenance]),
            FakeExecuteResult([relationship_with_provenance, relationship_without_provenance]),
        ]
    )
    service = ProvenanceService(db)

    async def fake_has_provenance(graph_object_type: str, graph_object_id):
        if graph_object_type == GraphObjectType.ENTITY.value:
            return graph_object_id == entity_with_provenance.id
        return graph_object_id == relationship_with_provenance.id

    monkeypatch.setattr(service, "_has_provenance", fake_has_provenance)

    report = await service.validate_provenance(workspace_id)

    assert report["valid"] is False
    assert report["total_entities"] == 2
    assert report["entities_with_provenance"] == 1
    assert report["entities_without_provenance"] == [
        {
            "id": str(entity_without_provenance.id),
            "name": "Entity Without Provenance",
            "type": EntityType.PERSON.value,
        }
    ]
    assert report["total_relationships"] == 2
    assert report["relationships_with_provenance"] == 1
    assert report["relationships_without_provenance"] == [
        {
            "id": str(relationship_without_provenance.id),
            "predicate": "depends_on",
        }
    ]
