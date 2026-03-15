from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import RunModel
from openforge.domains.artifacts.service import ArtifactService
from openforge.domains.policies.approval_service import ApprovalService
from openforge.runtime.checkpoint_store import CheckpointStore
from openforge.runtime.coordinator import RuntimeCoordinator
from openforge.runtime.event_publisher import EventPublisher
from tests.domains.graph._helpers import FakeAsyncSession


class CompositeWorkflowService:
    def __init__(self, workflows: dict):
        self.workflows = workflows

    async def get_runtime_workflow(self, workflow_id, workflow_version_id=None):
        workflow = self.workflows.get(workflow_id)
        if workflow is None:
            return None
        if workflow_version_id is None:
            return workflow
        if workflow["current_version"]["id"] == workflow_version_id:
            return workflow
        return None


def _child_workflow() -> dict:
    workflow_id = uuid4()
    version_id = uuid4()
    prepare_id = uuid4()
    terminal_id = uuid4()
    return {
        "id": workflow_id,
        "workspace_id": uuid4(),
        "name": "Child workflow",
        "slug": "child-workflow",
        "current_version": {
            "id": version_id,
            "workflow_id": workflow_id,
            "version_number": 1,
            "entry_node_id": prepare_id,
            "nodes": [
                {
                    "id": prepare_id,
                    "node_key": "child.prepare",
                    "node_type": "tool",
                    "label": "Prepare child result",
                    "executor_ref": "tool.template",
                    "config": {
                        "operation": "template",
                        "template": "Child result: {request}",
                        "output_key": "child_summary",
                    },
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": terminal_id,
                    "node_key": "child.done",
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
                {
                    "id": uuid4(),
                    "from_node_id": prepare_id,
                    "to_node_id": terminal_id,
                    "edge_type": "success",
                    "priority": 100,
                    "status": "active",
                }
            ],
        },
    }


def _delegate_parent_workflow(child_workflow_id) -> dict:
    workflow_id = uuid4()
    version_id = uuid4()
    delegate_id = uuid4()
    terminal_id = uuid4()
    return {
        "id": workflow_id,
        "workspace_id": uuid4(),
        "name": "Delegate parent",
        "slug": "delegate-parent",
        "current_version": {
            "id": version_id,
            "workflow_id": workflow_id,
            "version_number": 1,
            "entry_node_id": delegate_id,
            "nodes": [
                {
                    "id": delegate_id,
                    "node_key": "delegate.child",
                    "node_type": "delegate_call",
                    "label": "Delegate call",
                    "executor_ref": "runtime.delegate_call",
                    "config": {
                        "delegation_mode": "call",
                        "child_workflow_id": str(child_workflow_id),
                        "input_mapping": {"request": "request"},
                        "output_mapping": {"delegated_summary": "child_summary"},
                    },
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": terminal_id,
                    "node_key": "parent.done",
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
                {
                    "id": uuid4(),
                    "from_node_id": delegate_id,
                    "to_node_id": terminal_id,
                    "edge_type": "success",
                    "priority": 100,
                    "status": "active",
                }
            ],
        },
    }


def _fanout_parent_workflow(child_workflow_id) -> dict:
    workflow_id = uuid4()
    version_id = uuid4()
    fanout_id = uuid4()
    join_id = uuid4()
    reduce_id = uuid4()
    terminal_id = uuid4()
    return {
        "id": workflow_id,
        "workspace_id": uuid4(),
        "name": "Fanout parent",
        "slug": "fanout-parent",
        "current_version": {
            "id": version_id,
            "workflow_id": workflow_id,
            "version_number": 1,
            "entry_node_id": fanout_id,
            "nodes": [
                {
                    "id": fanout_id,
                    "node_key": "research.fanout",
                    "node_type": "fanout",
                    "label": "Fan out",
                    "executor_ref": "runtime.fanout",
                    "config": {
                        "delegation_mode": "fanout",
                        "child_workflow_id": str(child_workflow_id),
                        "fanout_items_key": "research_tasks",
                        "join_group_id": "research-branches",
                        "input_mapping": {"request": "item"},
                    },
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": join_id,
                    "node_key": "research.join",
                    "node_type": "join",
                    "label": "Join",
                    "executor_ref": "runtime.join",
                    "config": {"join_group_id": "research-branches", "output_key": "joined_branches"},
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": reduce_id,
                    "node_key": "research.reduce",
                    "node_type": "reduce",
                    "label": "Reduce",
                    "executor_ref": "runtime.reduce",
                    "config": {
                        "source_key": "joined_branches",
                        "output_key": "research_summary",
                        "strategy": "concat_field",
                        "field": "child_summary",
                    },
                    "input_mapping": {},
                    "output_mapping": {},
                    "status": "active",
                },
                {
                    "id": terminal_id,
                    "node_key": "research.done",
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
                {"id": uuid4(), "from_node_id": fanout_id, "to_node_id": join_id, "edge_type": "success", "priority": 100, "status": "active"},
                {"id": uuid4(), "from_node_id": join_id, "to_node_id": reduce_id, "edge_type": "success", "priority": 100, "status": "active"},
                {"id": uuid4(), "from_node_id": reduce_id, "to_node_id": terminal_id, "edge_type": "success", "priority": 100, "status": "active"},
            ],
        },
    }


@pytest.mark.asyncio
async def test_delegate_call_spawns_child_run_and_merges_output() -> None:
    child = _child_workflow()
    parent = _delegate_parent_workflow(child["id"])
    db = FakeAsyncSession()
    coordinator = RuntimeCoordinator(
        db=db,
        workflow_service=CompositeWorkflowService({child["id"]: child, parent["id"]: parent}),
        artifact_service=ArtifactService(db),
        approval_service=ApprovalService(db),
        checkpoint_store=CheckpointStore(db),
        event_publisher=EventPublisher(db),
    )

    run_id = await coordinator.execute_workflow(
        workflow_id=parent["id"],
        input_payload={"request": "Write the summary"},
        workspace_id=parent["workspace_id"],
    )

    run = db.objects[(RunModel, run_id)]
    assert run.status == "completed"
    assert run.output_payload["delegated_summary"] == "Child result: Write the summary"


@pytest.mark.asyncio
async def test_fanout_join_reduce_aggregates_branch_results() -> None:
    child = _child_workflow()
    parent = _fanout_parent_workflow(child["id"])
    db = FakeAsyncSession()
    coordinator = RuntimeCoordinator(
        db=db,
        workflow_service=CompositeWorkflowService({child["id"]: child, parent["id"]: parent}),
        artifact_service=ArtifactService(db),
        approval_service=ApprovalService(db),
        checkpoint_store=CheckpointStore(db),
        event_publisher=EventPublisher(db),
    )

    run_id = await coordinator.execute_workflow(
        workflow_id=parent["id"],
        input_payload={"research_tasks": ["alpha", "beta"]},
        workspace_id=parent["workspace_id"],
    )

    run = db.objects[(RunModel, run_id)]
    assert run.status == "completed"
    assert "Child result: alpha" in run.output_payload["research_summary"]
    assert "Child result: beta" in run.output_payload["research_summary"]
