from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from openforge.domains.artifacts.router import get_artifact_service
from openforge.domains.router_registry import register_domain_routers


class ArtifactStubService:
    async def list_artifacts(self, skip: int = 0, limit: int = 100, workspace_id=None, **_kwargs):
        return [], 0

    async def get_artifact(self, _identifier):
        return None

    async def create_artifact(self, payload: dict):
        return {"id": str(uuid4()), **payload, "version": 1}

    async def update_artifact(self, _identifier, payload: dict):
        return {"id": str(uuid4()), **payload, "version": 1}

    async def delete_artifact(self, _identifier):
        return True

    async def list_versions(self, artifact_id):
        return [
            {
                "id": str(uuid4()),
                "artifact_id": str(artifact_id),
                "version_number": 2,
                "content_type": "markdown",
                "content": "Version two",
                "structured_payload": {"score": 2},
                "summary": "Version two summary",
                "change_note": "Updated after review",
                "source_run_id": None,
                "source_evidence_packet_id": None,
                "status": "active",
                "created_by_type": "user",
                "created_by_id": None,
                "created_at": None,
                "updated_at": None,
            }
        ]

    async def get_version(self, artifact_id, version_id):
        return {
            "id": str(version_id),
            "artifact_id": str(artifact_id),
            "version_number": 2,
            "content_type": "markdown",
            "content": "Version two",
            "structured_payload": {"score": 2},
            "summary": "Version two summary",
            "change_note": "Updated after review",
            "source_run_id": None,
            "source_evidence_packet_id": None,
            "status": "active",
            "created_by_type": "user",
            "created_by_id": None,
            "created_at": None,
            "updated_at": None,
        }

    async def create_version(self, artifact_id, payload):
        return {
            "id": str(artifact_id),
            "artifact_type": "report",
            "workspace_id": str(uuid4()),
            "title": "Artifact",
            "summary": payload.get("summary"),
            "status": "active",
            "visibility": "workspace",
            "creation_mode": "user_created",
            "current_version_id": str(uuid4()),
            "current_version_number": 2,
            "source_run_id": None,
            "source_workflow_id": None,
            "source_mission_id": None,
            "source_profile_id": None,
            "created_by_type": "user",
            "created_by_id": None,
            "tags": [],
            "metadata": {},
            "current_version": None,
            "content": {},
            "version": 2,
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
        }

    async def promote_version(self, artifact_id, _version_id):
        return {
            "id": str(artifact_id),
            "artifact_type": "report",
            "workspace_id": str(uuid4()),
            "title": "Artifact",
            "summary": "Promoted",
            "status": "active",
            "visibility": "workspace",
            "creation_mode": "user_created",
            "current_version_id": str(uuid4()),
            "current_version_number": 2,
            "source_run_id": None,
            "source_workflow_id": None,
            "source_mission_id": None,
            "source_profile_id": None,
            "created_by_type": "user",
            "created_by_id": None,
            "tags": [],
            "metadata": {},
            "current_version": None,
            "content": {},
            "version": 2,
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
        }

    async def get_version_diff_summary(self, artifact_id, version_id, compare_to_version_id):
        return {
            "artifact_id": str(artifact_id),
            "from_version_id": str(compare_to_version_id),
            "to_version_id": str(version_id),
            "from_version_number": 1,
            "to_version_number": 2,
            "content_changed": True,
            "structured_payload_changed": True,
            "summary_changed": True,
            "change_note_changed": True,
            "content_preview": "--- v1\n+++ v2",
        }

    async def get_lineage(self, artifact_id):
        return {
            "artifact_id": str(artifact_id),
            "sources": [
                {
                    "id": str(uuid4()),
                    "artifact_id": str(artifact_id),
                    "version_id": None,
                    "link_type": "source",
                    "target_type": "run",
                    "target_id": str(uuid4()),
                    "label": "Generated by run",
                    "metadata": {},
                    "created_at": None,
                }
            ],
            "derivations": [],
            "related": [],
        }

    async def add_link(self, artifact_id, payload):
        return {
            "id": str(uuid4()),
            "artifact_id": str(artifact_id),
            "version_id": None,
            **payload,
            "created_at": None,
        }

    async def list_sinks(self, artifact_id):
        return [
            {
                "id": str(uuid4()),
                "artifact_id": str(artifact_id),
                "sink_type": "internal_workspace",
                "sink_state": "configured",
                "destination_ref": "workspace://artifacts",
                "sync_status": "not_published",
                "metadata": {},
                "last_synced_at": None,
                "created_at": None,
                "updated_at": None,
            }
        ]

    async def add_sink(self, artifact_id, payload):
        return {
            "id": str(uuid4()),
            "artifact_id": str(artifact_id),
            **payload,
            "last_synced_at": None,
            "created_at": None,
            "updated_at": None,
        }


def create_client() -> TestClient:
    app = FastAPI()
    register_domain_routers(app)
    app.dependency_overrides[get_artifact_service] = lambda: ArtifactStubService()
    return TestClient(app)


def test_artifact_versions_endpoint_returns_expected_shape() -> None:
    client = create_client()
    artifact_id = str(uuid4())

    response = client.get(f"/api/v1/artifacts/{artifact_id}/versions")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["versions"][0]["version_number"] == 2
    assert payload["versions"][0]["content_type"] == "markdown"


def test_artifact_lineage_endpoint_returns_grouped_links() -> None:
    client = create_client()
    artifact_id = str(uuid4())

    response = client.get(f"/api/v1/artifacts/{artifact_id}/lineage")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_id"] == artifact_id
    assert payload["sources"][0]["target_type"] == "run"


def test_artifact_sinks_endpoint_returns_sink_state() -> None:
    client = create_client()
    artifact_id = str(uuid4())

    response = client.get(f"/api/v1/artifacts/{artifact_id}/sinks")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["sinks"][0]["sink_type"] == "internal_workspace"
    assert payload["sinks"][0]["sync_status"] == "not_published"
