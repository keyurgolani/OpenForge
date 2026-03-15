"""
Phase 1 API smoke tests.
"""

from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from openforge.domains.artifacts.router import get_artifact_service
from openforge.domains.missions.router import get_mission_service
from openforge.domains.profiles.router import get_profile_service
from openforge.domains.router_registry import register_domain_routers
from openforge.domains.runs.router import get_run_service
from openforge.domains.triggers.router import get_trigger_service
from openforge.domains.workflows.router import get_workflow_service


class StubCrudService:
    async def list_profiles(
        self,
        skip: int = 0,
        limit: int = 100,
        is_system=None,
        is_template=None,
        is_featured=None,
        status=None,
        tags=None,
    ):
        return [], 0

    async def get_profile(self, _identifier):
        return None

    async def create_profile(self, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def update_profile(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def delete_profile(self, _identifier):
        return True

    async def list_workflows(self, skip: int = 0, limit: int = 100):
        return [], 0

    async def get_workflow(self, _identifier):
        return None

    async def create_workflow(self, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def update_workflow(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def delete_workflow(self, _identifier):
        return True

    async def list_missions(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id=None,
        status=None,
        is_system=None,
        is_template=None,
        is_featured=None,
        tags=None,
    ):
        return [], 0

    async def get_mission(self, _identifier):
        return None

    async def create_mission(self, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def update_mission(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def delete_mission(self, _identifier):
        return True

    async def list_triggers(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id=None,
        target_type=None,
        target_id=None,
        trigger_type=None,
        is_enabled=None,
    ):
        return [], 0

    async def get_trigger(self, _identifier):
        return None

    async def create_trigger(self, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def update_trigger(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def delete_trigger(self, _identifier):
        return True

    async def list_runs(self, skip: int = 0, limit: int = 100, workspace_id=None):
        if workspace_id is None:
            return [], 0
        return [{
            "id": str(uuid4()),
            "run_type": "mission",
            "workflow_id": None,
            "mission_id": None,
            "parent_run_id": None,
            "workspace_id": str(workspace_id),
            "status": "pending",
            "state_snapshot": {},
            "input_payload": {},
            "output_payload": {},
            "error_code": None,
            "error_message": None,
            "started_at": None,
            "completed_at": None,
        }], 1

    async def get_run(self, _identifier):
        return None

    async def create_run(self, payload: dict):
        return {"id": str(uuid4()), **payload, "status": "pending", "state_snapshot": {}, "output_payload": {}, "error_code": None, "error_message": None, "started_at": None, "completed_at": None}

    async def update_run(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "status": "pending", "state_snapshot": {}, "input_payload": {}, "started_at": None, "completed_at": None}

    async def list_artifacts(self, skip: int = 0, limit: int = 100, workspace_id=None):
        if workspace_id is None:
            return [], 0
        return [{
            "id": str(uuid4()),
            "artifact_type": "document",
            "workspace_id": str(workspace_id),
            "source_run_id": None,
            "source_mission_id": None,
            "title": "Scoped artifact",
            "summary": None,
            "content": {},
            "metadata": {},
            "status": "draft",
            "version": 1,
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
        }], 1

    async def get_artifact(self, _identifier):
        return None

    async def create_artifact(self, payload: dict):
        return {"id": str(uuid4()), **payload, "version": 1, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def update_artifact(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "version": 1, "created_at": None, "updated_at": None, "created_by": None, "updated_by": None}

    async def delete_artifact(self, _identifier):
        return True


def create_client() -> TestClient:
    app = FastAPI()
    register_domain_routers(app)
    stub = StubCrudService()
    app.dependency_overrides[get_profile_service] = lambda: stub
    app.dependency_overrides[get_workflow_service] = lambda: stub
    app.dependency_overrides[get_mission_service] = lambda: stub
    app.dependency_overrides[get_trigger_service] = lambda: stub
    app.dependency_overrides[get_run_service] = lambda: stub
    app.dependency_overrides[get_artifact_service] = lambda: stub
    return TestClient(app)


def test_profiles_api_list():
    client = create_client()
    response = client.get("/api/v1/profiles/")
    assert response.status_code == 200


def test_workflows_api_list():
    client = create_client()
    response = client.get("/api/v1/workflows/")
    assert response.status_code == 200


def test_missions_api_list():
    client = create_client()
    response = client.get("/api/v1/missions/")
    assert response.status_code == 200


def test_triggers_api_list():
    client = create_client()
    response = client.get("/api/v1/triggers/")
    assert response.status_code == 200


def test_runs_api_list():
    client = create_client()
    response = client.get("/api/v1/runs/")
    assert response.status_code == 200


def test_artifacts_api_list():
    client = create_client()
    response = client.get("/api/v1/artifacts/")
    assert response.status_code == 200


def test_runs_api_list_accepts_workspace_filter():
    client = create_client()
    workspace_id = str(uuid4())
    response = client.get("/api/v1/runs/", params={"workspace_id": workspace_id})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["runs"][0]["workspace_id"] == workspace_id


def test_artifacts_api_list_accepts_workspace_filter():
    client = create_client()
    workspace_id = str(uuid4())
    response = client.get("/api/v1/artifacts/", params={"workspace_id": workspace_id})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["artifacts"][0]["workspace_id"] == workspace_id


def test_profiles_api_create_validation():
    client = create_client()
    response = client.post("/api/v1/profiles/", json={})
    assert response.status_code == 422


def test_workflows_api_create_validation():
    client = create_client()
    response = client.post("/api/v1/workflows/", json={})
    assert response.status_code == 422


def test_missions_api_create_validation():
    client = create_client()
    response = client.post("/api/v1/missions/", json={})
    assert response.status_code == 422
