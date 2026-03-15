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
    assert "plan-execute-review" in blueprint_by_slug
    assert "map-reduce-research" in blueprint_by_slug
    assert "reviewer-council-reduce" in blueprint_by_slug
    workflow = blueprint_by_slug["review-and-publish"]["workflow"]
    nodes = workflow["version"]["nodes"]
    edges = workflow["version"]["edges"]

    assert workflow["workspace_id"] == DEFAULT_SEED_WORKSPACE_ID
    assert workflow["status"] == "active"
    assert workflow["is_system"] is True
    assert workflow["is_template"] is True
    assert workflow["template_kind"] == "composite_pattern"
    assert {node["node_type"] for node in nodes} == {"tool", "approval", "artifact", "terminal"}
    assert any(edge["edge_type"] == "approved" for edge in edges)

    map_reduce_nodes = blueprint_by_slug["map-reduce-research"]["workflow"]["version"]["nodes"]
    assert {node["node_type"] for node in map_reduce_nodes} == {"fanout", "join", "reduce", "terminal"}


@pytest.mark.asyncio
async def test_seed_example_workflows_create_phase9_runtime_ready_workflow() -> None:
    db = FakeAsyncSession()
    service = WorkflowService(db)

    created_workflows = await seed_example_workflows(service)

    assert len(created_workflows) == 4
    workflow_by_slug = {workflow["slug"]: workflow for workflow in created_workflows}

    review_workflow = workflow_by_slug["review-and-publish"]
    current_version = review_workflow["current_version"]
    assert review_workflow["status"] == "active"
    assert current_version["entry_node"]["node_key"] == "review.prepare"
    assert [node["node_key"] for node in current_version["nodes"]] == [
        "review.prepare",
        "approval.publish",
        "artifact.publish",
        "terminal.done",
    ]

    map_reduce = workflow_by_slug["map-reduce-research"]
    assert map_reduce["template_metadata"]["pattern"] == "map_reduce_research"
    assert [node["node_type"] for node in map_reduce["current_version"]["nodes"]] == [
        "fanout",
        "join",
        "reduce",
        "terminal",
    ]
