from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import WorkflowDefinitionModel, WorkflowEdgeModel, WorkflowNodeModel, WorkflowVersionModel
from openforge.domains.workflows.service import WorkflowService
from tests.domains.graph._helpers import FakeAsyncSession


def _review_publish_version_payload() -> dict:
    review_node_id = uuid4()
    approval_node_id = uuid4()
    artifact_node_id = uuid4()
    terminal_node_id = uuid4()

    return {
        "change_note": "Initial deterministic review workflow",
        "state_schema": {
            "type": "object",
            "properties": {
                "request": {"type": "string"},
                "review_text": {"type": "string"},
                "artifact_ids": {"type": "array"},
            },
        },
        "default_input_schema": {"type": "object", "required": ["request"]},
        "default_output_schema": {"type": "object", "required": ["artifact_ids"]},
        "entry_node_id": review_node_id,
        "nodes": [
            {
                "id": review_node_id,
                "node_key": "review.prepare",
                "node_type": "tool",
                "label": "Prepare Review",
                "executor_ref": "tool.template",
                "config": {"operation": "template", "template": "Review: {request}", "output_key": "review_text"},
                "status": "active",
            },
            {
                "id": approval_node_id,
                "node_key": "approval.publish",
                "node_type": "approval",
                "label": "Request Approval",
                "executor_ref": "approval.request",
                "config": {"requested_action": "Publish reviewed summary"},
                "status": "active",
            },
            {
                "id": artifact_node_id,
                "node_key": "artifact.publish",
                "node_type": "artifact",
                "label": "Emit Artifact",
                "executor_ref": "artifact.emit",
                "config": {
                    "artifact_type": "report",
                    "title_template": "Reviewed output",
                    "body_template": "{review_text}",
                    "artifact_state_key": "artifact_ids",
                },
                "status": "active",
            },
            {
                "id": terminal_node_id,
                "node_key": "terminal.done",
                "node_type": "terminal",
                "label": "Complete",
                "executor_ref": "terminal.complete",
                "config": {},
                "status": "active",
            },
        ],
        "edges": [
            {
                "id": uuid4(),
                "from_node_id": review_node_id,
                "to_node_id": approval_node_id,
                "edge_type": "success",
                "priority": 100,
                "label": "Prepared",
                "status": "active",
            },
            {
                "id": uuid4(),
                "from_node_id": approval_node_id,
                "to_node_id": artifact_node_id,
                "edge_type": "approved",
                "priority": 100,
                "label": "Approved",
                "status": "active",
            },
            {
                "id": uuid4(),
                "from_node_id": artifact_node_id,
                "to_node_id": terminal_node_id,
                "edge_type": "success",
                "priority": 100,
                "label": "Published",
                "status": "active",
            },
        ],
    }


@pytest.mark.asyncio
async def test_create_workflow_creates_initial_version_nodes_edges_and_current_projection() -> None:
    workspace_id = uuid4()
    db = FakeAsyncSession()
    service = WorkflowService(db)

    workflow = await service.create_workflow(
        {
            "workspace_id": workspace_id,
            "name": "Review and Publish",
            "slug": "review-and-publish",
            "description": "Deterministic approval workflow",
            "status": "draft",
            "is_system": True,
            "is_template": True,
            "version": _review_publish_version_payload(),
        }
    )

    assert workflow["workspace_id"] == workspace_id
    assert workflow["current_version"]["version_number"] == 1
    assert workflow["current_version"]["entry_node"]["node_key"] == "review.prepare"
    assert len(workflow["current_version"]["nodes"]) == 4
    assert len(workflow["current_version"]["edges"]) == 3
    assert workflow["nodes"][0]["node_key"] == "review.prepare"
    assert workflow["edges"][0]["label"] == "Prepared"

    created_versions = [obj for obj in db.added if isinstance(obj, WorkflowVersionModel)]
    created_nodes = [obj for obj in db.added if isinstance(obj, WorkflowNodeModel)]
    created_edges = [obj for obj in db.added if isinstance(obj, WorkflowEdgeModel)]

    assert len(created_versions) == 1
    assert created_versions[0].version_number == 1
    assert len(created_nodes) == 4
    assert len(created_edges) == 3


@pytest.mark.asyncio
async def test_create_version_and_activate_updates_current_workflow_version() -> None:
    workflow_id = uuid4()
    current_version_id = uuid4()
    workspace_id = uuid4()
    definition = WorkflowDefinitionModel(
        id=workflow_id,
        workspace_id=workspace_id,
        name="Review and Publish",
        slug="review-and-publish",
        description="Deterministic approval workflow",
        current_version_id=current_version_id,
        version=1,
        status="active",
        is_system=True,
        is_template=True,
    )
    current_version = WorkflowVersionModel(
        id=current_version_id,
        workflow_id=workflow_id,
        version_number=1,
        status="active",
        change_note="Initial version",
        state_schema={},
        default_input_schema={},
        default_output_schema={},
    )
    db = FakeAsyncSession(
        objects={
            (WorkflowDefinitionModel, workflow_id): definition,
            (WorkflowVersionModel, current_version_id): current_version,
        }
    )
    service = WorkflowService(db)

    created_version = await service.create_version(workflow_id, _review_publish_version_payload() | {"change_note": "Add publish artifact step"})
    activated = await service.activate_version(workflow_id, created_version["id"])

    assert created_version["version_number"] == 2
    assert activated["current_version_id"] == created_version["id"]
    assert activated["current_version"]["version_number"] == 2
    assert definition.current_version_id == created_version["id"]
