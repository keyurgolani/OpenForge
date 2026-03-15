from __future__ import annotations

import pytest

from openforge.domains.workflows.seed import (
    DEFAULT_SEED_WORKSPACE_ID,
    get_seed_workflow_blueprints,
    seed_example_workflows,
)
from openforge.domains.workflows.service import WorkflowService
from tests.domains.graph._helpers import FakeAsyncSession


def test_seed_workflow_blueprints_cover_phase9_runtime_blueprint() -> None:
    blueprints = get_seed_workflow_blueprints()
    blueprint_by_slug = {blueprint["slug"]: blueprint for blueprint in blueprints}

    assert "review-and-publish" in blueprint_by_slug
    workflow = blueprint_by_slug["review-and-publish"]["workflow"]
    nodes = workflow["version"]["nodes"]
    edges = workflow["version"]["edges"]

    assert workflow["workspace_id"] == DEFAULT_SEED_WORKSPACE_ID
    assert workflow["status"] == "active"
    assert workflow["is_system"] is True
    assert workflow["is_template"] is True
    assert {node["node_type"] for node in nodes} == {"tool", "approval", "artifact", "terminal"}
    assert any(edge["edge_type"] == "approved" for edge in edges)


@pytest.mark.asyncio
async def test_seed_example_workflows_create_phase9_runtime_ready_workflow() -> None:
    db = FakeAsyncSession()
    service = WorkflowService(db)

    created_workflows = await seed_example_workflows(service)

    assert len(created_workflows) == 1
    workflow = created_workflows[0]
    current_version = workflow["current_version"]

    assert workflow["slug"] == "review-and-publish"
    assert workflow["status"] == "active"
    assert current_version["entry_node"]["node_key"] == "review.prepare"
    assert [node["node_key"] for node in current_version["nodes"]] == [
        "review.prepare",
        "approval.publish",
        "artifact.publish",
        "terminal.done",
    ]
