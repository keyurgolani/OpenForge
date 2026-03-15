from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import ApprovalRequestModel, ArtifactModel, CheckpointModel, RunModel, RunStepModel, RuntimeEventModel
from openforge.domains.artifacts.service import ArtifactService
from openforge.domains.policies.approval_service import ApprovalService
from openforge.runtime.checkpoint_store import CheckpointStore
from openforge.runtime.coordinator import RuntimeCoordinator
from openforge.runtime.event_publisher import EventPublisher
from tests.domains.graph._helpers import FakeAsyncSession


class StubWorkflowRuntimeService:
    def __init__(self, workflow: dict):
        self.workflow = workflow

    async def get_runtime_workflow(self, workflow_id, workflow_version_id=None):
        assert workflow_id == self.workflow["id"]
        return self.workflow


def _runtime_workflow() -> dict:
    workflow_id = uuid4()
    version_id = uuid4()
    review_node_id = uuid4()
    approval_node_id = uuid4()
    artifact_node_id = uuid4()
    terminal_node_id = uuid4()
    return {
        "id": workflow_id,
        "workspace_id": uuid4(),
        "name": "Review and Publish",
        "slug": "review-and-publish",
        "current_version_id": version_id,
        "current_version": {
            "id": version_id,
            "workflow_id": workflow_id,
            "version_number": 1,
            "entry_node_id": review_node_id,
            "entry_node": {"id": review_node_id, "node_key": "review.prepare"},
            "nodes": [
                {
                    "id": review_node_id,
                    "node_key": "review.prepare",
                    "node_type": "tool",
                    "label": "Prepare Review",
                    "executor_ref": "tool.template",
                    "config": {"operation": "template", "template": "Review: {request}", "output_key": "review_text"},
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": approval_node_id,
                    "node_key": "approval.publish",
                    "node_type": "approval",
                    "label": "Approval",
                    "executor_ref": "approval.request",
                    "config": {"requested_action": "Publish reviewed output"},
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": artifact_node_id,
                    "node_key": "artifact.publish",
                    "node_type": "artifact",
                    "label": "Artifact",
                    "executor_ref": "artifact.emit",
                    "config": {
                        "artifact_type": "report",
                        "title_template": "Reviewed output",
                        "body_template": "{review_text}",
                        "artifact_state_key": "artifact_ids",
                    },
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": terminal_node_id,
                    "node_key": "terminal.done",
                    "node_type": "terminal",
                    "label": "Done",
                    "executor_ref": "terminal.complete",
                    "config": {},
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
            ],
            "edges": [
                {"id": uuid4(), "from_node_id": review_node_id, "to_node_id": approval_node_id, "edge_type": "success", "priority": 100, "label": "Prepared", "status": "active"},
                {"id": uuid4(), "from_node_id": approval_node_id, "to_node_id": artifact_node_id, "edge_type": "approved", "priority": 100, "label": "Approved", "status": "active"},
                {"id": uuid4(), "from_node_id": artifact_node_id, "to_node_id": terminal_node_id, "edge_type": "success", "priority": 100, "label": "Published", "status": "active"},
            ],
        },
    }


@pytest.mark.asyncio
async def test_runtime_coordinator_executes_approval_resume_and_artifact_emission() -> None:
    workflow = _runtime_workflow()
    db = FakeAsyncSession()
    coordinator = RuntimeCoordinator(
        db=db,
        workflow_service=StubWorkflowRuntimeService(workflow),
        artifact_service=ArtifactService(db),
        approval_service=ApprovalService(db),
        checkpoint_store=CheckpointStore(db),
        event_publisher=EventPublisher(db),
    )

    run_id = await coordinator.execute_workflow(
        workflow_id=workflow["id"],
        input_payload={"request": "Publish the reviewed rollout summary"},
        workspace_id=workflow["workspace_id"],
    )

    run = db.objects[(RunModel, run_id)]
    assert run.status == "waiting_approval"
    assert run.current_node_id is not None
    approval = next(obj for obj in db.added if isinstance(obj, ApprovalRequestModel))
    approval.status = "approved"

    await coordinator.resume_run(run_id)

    resumed = db.objects[(RunModel, run_id)]
    steps = [obj for obj in db.added if isinstance(obj, RunStepModel)]
    checkpoints = [obj for obj in db.added if isinstance(obj, CheckpointModel)]
    events = [obj for obj in db.added if isinstance(obj, RuntimeEventModel)]
    artifacts = [obj for obj in db.added if isinstance(obj, ArtifactModel)]

    assert resumed.status == "completed"
    assert [step.node_key for step in steps] == [
        "review.prepare",
        "approval.publish",
        "artifact.publish",
        "terminal.done",
    ]
    assert len(checkpoints) >= 4
    assert any(event.event_type == "run_interrupted" for event in events)
    assert any(event.event_type == "artifact_emitted" for event in events)
    assert len(artifacts) == 1
