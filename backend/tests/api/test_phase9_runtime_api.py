from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from openforge.domains.router_registry import register_domain_routers
from openforge.domains.runs.router import get_run_service
from openforge.domains.workflows.router import get_workflow_service


class WorkflowPhase9StubService:
    async def list_workflows(self, skip: int = 0, limit: int = 100, **_kwargs):
        return [], 0

    async def get_workflow(self, workflow_id):
        version_id = str(uuid4())
        node_id = str(uuid4())
        return {
            "id": str(workflow_id),
            "workspace_id": str(uuid4()),
            "name": "Review and Publish",
            "slug": "review-and-publish",
            "description": "Deterministic approval workflow",
            "status": "active",
            "current_version_id": version_id,
            "is_system": True,
            "is_template": True,
            "current_version": {
                "id": version_id,
                "workflow_id": str(workflow_id),
                "version_number": 1,
                "entry_node_id": node_id,
                "entry_node": {"id": node_id, "node_key": "review.prepare", "node_type": "tool", "label": "Prepare Review"},
                "state_schema": {},
                "default_input_schema": {},
                "default_output_schema": {},
                "status": "active",
                "change_note": "Initial version",
                "nodes": [],
                "edges": [],
                "created_at": None,
                "updated_at": None,
            },
            "nodes": [],
            "edges": [],
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
        }

    async def create_workflow(self, payload: dict):
        return await self.get_workflow(uuid4())

    async def update_workflow(self, _identifier, _payload: dict):
        return await self.get_workflow(uuid4())

    async def delete_workflow(self, _identifier):
        return True

    async def list_versions(self, workflow_id):
        return [
            {
                "id": str(uuid4()),
                "workflow_id": str(workflow_id),
                "version_number": 1,
                "entry_node_id": str(uuid4()),
                "entry_node": None,
                "state_schema": {},
                "default_input_schema": {},
                "default_output_schema": {},
                "status": "active",
                "change_note": "Initial version",
                "nodes": [],
                "edges": [],
                "created_at": None,
                "updated_at": None,
            }
        ]

    async def get_version(self, workflow_id, version_id):
        return (await self.list_versions(workflow_id))[0] | {"id": str(version_id)}

    async def create_version(self, workflow_id, payload):
        return (await self.list_versions(workflow_id))[0] | {"change_note": payload.get("change_note")}

    async def activate_version(self, workflow_id, version_id):
        workflow = await self.get_workflow(workflow_id)
        workflow["current_version_id"] = str(version_id)
        return workflow

    async def list_nodes(self, workflow_id, version_id):
        return [
            {
                "id": str(uuid4()),
                "workflow_version_id": str(version_id),
                "node_key": "review.prepare",
                "node_type": "tool",
                "label": "Prepare Review",
                "description": None,
                "config": {"operation": "template"},
                "executor_ref": "tool.template",
                "input_mapping": {},
                "output_mapping": {},
                "status": "active",
                "created_at": None,
                "updated_at": None,
            }
        ]

    async def list_edges(self, workflow_id, version_id):
        node_id = str(uuid4())
        return [
            {
                "id": str(uuid4()),
                "workflow_version_id": str(version_id),
                "from_node_id": node_id,
                "to_node_id": str(uuid4()),
                "edge_type": "success",
                "condition": {},
                "priority": 100,
                "label": "Prepared",
                "status": "active",
                "created_at": None,
                "updated_at": None,
            }
        ]


class RunPhase9StubService:
    async def list_runs(self, skip: int = 0, limit: int = 100, workspace_id=None, **_kwargs):
        return [], 0

    async def get_run(self, run_id):
        return {
            "id": str(run_id),
            "run_type": "workflow",
            "workflow_id": str(uuid4()),
            "workflow_version_id": str(uuid4()),
            "mission_id": None,
            "parent_run_id": None,
            "root_run_id": str(run_id),
            "spawned_by_step_id": None,
            "workspace_id": str(uuid4()),
            "status": "waiting_approval",
            "state_snapshot": {"review_text": "Ready for approval"},
            "input_payload": {"request": "Publish"},
            "output_payload": {},
            "current_node_id": str(uuid4()),
            "error_code": None,
            "error_message": None,
            "started_at": None,
            "completed_at": None,
            "cancelled_at": None,
            "created_at": None,
            "updated_at": None,
        }

    async def create_run(self, payload: dict):
        return await self.get_run(uuid4())

    async def update_run(self, _identifier, _payload: dict):
        return await self.get_run(uuid4())

    async def delete_run(self, _identifier):
        return True

    async def list_steps(self, run_id):
        return [
            {
                "id": str(uuid4()),
                "run_id": str(run_id),
                "node_id": str(uuid4()),
                "node_key": "review.prepare",
                "step_index": 1,
                "status": "completed",
                "input_snapshot": {"request": "Publish"},
                "output_snapshot": {"review_text": "Ready"},
                "checkpoint_id": str(uuid4()),
                "error_code": None,
                "error_message": None,
                "retry_count": 0,
                "started_at": None,
                "completed_at": None,
                "created_at": None,
                "updated_at": None,
            }
        ]

    async def get_lineage(self, run_id):
        return {
            "run_id": str(run_id),
            "parent_run": None,
            "child_runs": [
                {
                    "id": str(uuid4()),
                    "status": "completed",
                }
            ],
        }

    async def list_checkpoints(self, run_id):
        return [
            {
                "id": str(uuid4()),
                "run_id": str(run_id),
                "step_id": str(uuid4()),
                "checkpoint_type": "after_step",
                "state_snapshot": {"review_text": "Ready"},
                "metadata": {},
                "created_at": None,
            }
        ]

    async def list_events(self, run_id):
        return [
            {
                "id": str(uuid4()),
                "run_id": str(run_id),
                "step_id": str(uuid4()),
                "workflow_id": str(uuid4()),
                "workflow_version_id": str(uuid4()),
                "node_id": str(uuid4()),
                "node_key": "approval.publish",
                "event_type": "run_interrupted",
                "payload": {"approval_request_id": str(uuid4())},
                "created_at": None,
            }
        ]

    async def start_run(self, payload):
        run = await self.get_run(uuid4())
        run["workflow_id"] = str(payload["workflow_id"])
        run["workspace_id"] = str(payload["workspace_id"])
        return run

    async def resume_run(self, run_id):
        run = await self.get_run(run_id)
        run["status"] = "completed"
        return run

    async def cancel_run(self, run_id):
        run = await self.get_run(run_id)
        run["status"] = "cancelled"
        return run


def create_client() -> TestClient:
    app = FastAPI()
    register_domain_routers(app)
    app.dependency_overrides[get_workflow_service] = lambda: WorkflowPhase9StubService()
    app.dependency_overrides[get_run_service] = lambda: RunPhase9StubService()
    return TestClient(app)


def test_workflow_versions_endpoint_returns_phase9_shape() -> None:
    client = create_client()
    workflow_id = str(uuid4())

    response = client.get(f"/api/v1/workflows/{workflow_id}/versions")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["versions"][0]["version_number"] == 1


def test_workflow_nodes_endpoint_returns_explicit_nodes() -> None:
    client = create_client()
    workflow_id = str(uuid4())
    version_id = str(uuid4())

    response = client.get(f"/api/v1/workflows/{workflow_id}/versions/{version_id}/nodes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["nodes"][0]["node_key"] == "review.prepare"


def test_run_steps_checkpoint_and_event_endpoints_return_phase9_data() -> None:
    client = create_client()
    run_id = str(uuid4())

    steps = client.get(f"/api/v1/runs/{run_id}/steps")
    checkpoints = client.get(f"/api/v1/runs/{run_id}/checkpoints")
    events = client.get(f"/api/v1/runs/{run_id}/events")

    assert steps.status_code == 200
    assert checkpoints.status_code == 200
    assert events.status_code == 200
    assert steps.json()["steps"][0]["node_key"] == "review.prepare"
    assert checkpoints.json()["checkpoints"][0]["checkpoint_type"] == "after_step"
    assert events.json()["events"][0]["event_type"] == "run_interrupted"


def test_run_start_and_resume_endpoints_exist() -> None:
    client = create_client()
    workflow_id = str(uuid4())
    workspace_id = str(uuid4())

    started = client.post(
        "/api/v1/runs/start",
        json={"workflow_id": workflow_id, "workspace_id": workspace_id, "input_payload": {"request": "Publish"}},
    )
    resumed = client.post(f"/api/v1/runs/{uuid4()}/resume")

    assert started.status_code == 201
    assert started.json()["status"] == "waiting_approval"
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "completed"
