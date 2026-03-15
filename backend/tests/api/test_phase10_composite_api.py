from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from openforge.domains.router_registry import register_domain_routers
from openforge.domains.runs.router import get_run_service
from openforge.domains.workflows.router import get_workflow_service


class WorkflowPhase10StubService:
    async def list_workflows(self, skip: int = 0, limit: int = 100, is_template=None, **_kwargs):
        workflow = await self.get_workflow(uuid4())
        if is_template is False:
            return [], 0
        return [workflow], 1

    async def list_templates(self, skip: int = 0, limit: int = 100, template_kind=None):
        workflow = await self.get_workflow(uuid4())
        workflow["template_kind"] = template_kind or "composite_pattern"
        workflow["template_metadata"] = {"pattern": "map_reduce_research"}
        return [workflow], 1

    async def get_workflow(self, workflow_id):
        node_id = str(uuid4())
        workflow_version_id = str(uuid4())
        entry_node = {
            "id": node_id,
            "workflow_version_id": workflow_version_id,
            "node_key": "research.fanout",
            "node_type": "fanout",
            "label": "Fan out",
            "description": None,
            "config": {"join_group_id": "research-branches"},
            "executor_ref": "runtime.fanout",
            "input_mapping": {},
            "output_mapping": {},
            "status": "active",
            "created_at": None,
            "updated_at": None,
        }
        return {
            "id": str(workflow_id),
            "workspace_id": str(uuid4()),
            "name": "Map Reduce Research",
            "slug": "map-reduce-research",
            "description": "Composite workflow",
            "status": "active",
            "current_version_id": str(uuid4()),
            "is_system": True,
            "is_template": True,
            "template_kind": "composite_pattern",
            "template_metadata": {"pattern": "map_reduce_research", "badges": ["fanout", "reduce"]},
            "current_version": {
                "id": workflow_version_id,
                "workflow_id": str(workflow_id),
                "version_number": 1,
                "entry_node_id": node_id,
                "entry_node": entry_node,
                "state_schema": {},
                "default_input_schema": {},
                "default_output_schema": {},
                "status": "active",
                "change_note": "Phase 10 composite template",
                "nodes": [
                    entry_node
                ],
                "edges": [],
                "created_at": None,
                "updated_at": None,
            },
            "version": 1,
            "entry_node": "research.fanout",
            "state_schema": {},
            "nodes": [],
            "edges": [],
            "default_input_schema": {},
            "default_output_schema": {},
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
        }

    async def get_template(self, workflow_id):
        return await self.get_workflow(workflow_id)

    async def clone_template(self, workflow_id, payload: dict):
        workflow = await self.get_workflow(workflow_id)
        workflow["workspace_id"] = str(payload["workspace_id"])
        workflow["name"] = payload.get("name") or workflow["name"]
        workflow["slug"] = payload.get("slug") or workflow["slug"]
        workflow["is_template"] = False
        return workflow


class RunPhase10StubService:
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
            "status": "completed",
            "state_snapshot": {},
            "input_payload": {},
            "output_payload": {"research_summary": "joined summary"},
            "current_node_id": None,
            "error_code": None,
            "error_message": None,
            "delegation_mode": "fanout",
            "merge_strategy": "concat_field",
            "join_group_id": "research-branches",
            "branch_key": None,
            "branch_index": None,
            "handoff_reason": None,
            "composite_metadata": {"pattern": "map_reduce_research"},
            "started_at": None,
            "completed_at": None,
            "cancelled_at": None,
            "created_at": None,
            "updated_at": None,
        }

    async def get_lineage(self, run_id):
        return {
            "run_id": str(run_id),
            "parent_run": None,
            "child_runs": [],
            "tree": {"run_id": str(run_id), "children": []},
            "delegation_history": [{"delegation_mode": "fanout", "node_key": "research.fanout"}],
            "branch_groups": [{"join_group_id": "research-branches", "branch_count": 3}],
        }

    async def get_composite_debug(self, run_id):
        return {
            "run_id": str(run_id),
            "delegation_history": [{"delegation_mode": "fanout"}],
            "branch_groups": [{"join_group_id": "research-branches"}],
            "merge_outcomes": [{"node_key": "research.reduce", "strategy": "concat_field"}],
        }


def create_client() -> TestClient:
    app = FastAPI()
    register_domain_routers(app)
    app.dependency_overrides[get_workflow_service] = lambda: WorkflowPhase10StubService()
    app.dependency_overrides[get_run_service] = lambda: RunPhase10StubService()
    return TestClient(app)


def test_workflow_templates_endpoint_returns_phase10_template_shape() -> None:
    client = create_client()

    response = client.get("/api/v1/workflows/templates?template_kind=composite_pattern")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["workflows"][0]["template_kind"] == "composite_pattern"
    assert payload["workflows"][0]["template_metadata"]["pattern"] == "map_reduce_research"


def test_clone_template_endpoint_returns_workspace_workflow() -> None:
    client = create_client()
    workflow_id = str(uuid4())
    workspace_id = str(uuid4())

    response = client.post(
        f"/api/v1/workflows/templates/{workflow_id}/clone",
        json={"workspace_id": workspace_id, "name": "Research clone", "slug": "research-clone"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["workspace_id"] == workspace_id
    assert payload["is_template"] is False
    assert payload["name"] == "Research clone"


def test_run_composite_debug_endpoint_returns_branch_and_merge_info() -> None:
    client = create_client()
    run_id = str(uuid4())

    response = client.get(f"/api/v1/runs/{run_id}/composite")

    assert response.status_code == 200
    payload = response.json()
    assert payload["branch_groups"][0]["join_group_id"] == "research-branches"
    assert payload["merge_outcomes"][0]["strategy"] == "concat_field"
