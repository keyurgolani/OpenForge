from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import RelationshipModel
from openforge.domains.graph.traversal import GraphTraversalService

from ._helpers import FakeAsyncSession, FakeExecuteResult


@pytest.mark.asyncio
async def test_find_path_returns_shortest_multi_hop_path() -> None:
    entity_a = uuid4()
    entity_b = uuid4()
    entity_c = uuid4()

    relationship_ab = RelationshipModel(
        id=uuid4(),
        workspace_id=uuid4(),
        subject_entity_id=entity_a,
        object_entity_id=entity_b,
        predicate="references",
        status="active",
    )
    relationship_bc = RelationshipModel(
        id=uuid4(),
        workspace_id=relationship_ab.workspace_id,
        subject_entity_id=entity_b,
        object_entity_id=entity_c,
        predicate="depends_on",
        status="active",
    )

    db = FakeAsyncSession(
        execute_results=[
            FakeExecuteResult([relationship_ab]),
            FakeExecuteResult([relationship_bc]),
        ]
    )
    service = GraphTraversalService(db)

    response = await service.find_path(entity_a, entity_c, max_depth=3)

    assert response.found is True
    assert response.total_hops == 2
    assert [hop.predicate for hop in response.hops] == ["references", "depends_on"]
