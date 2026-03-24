"""Tests for deployment schemas."""

from uuid import uuid4

from openforge.domains.deployments.schemas import DeploymentCreate, DeploymentResponse


def test_deployment_create_minimal():
    d = DeploymentCreate(workspace_id=uuid4())
    assert d.input_values == {}


def test_deployment_create_with_values():
    d = DeploymentCreate(workspace_id=uuid4(), input_values={"topic": "AI"})
    assert d.input_values == {"topic": "AI"}


def test_deployment_response_from_dict():
    data = {
        "id": uuid4(),
        "automation_id": uuid4(),
        "workspace_id": uuid4(),
        "status": "active",
    }
    r = DeploymentResponse(**data)
    assert r.status == "active"
    assert r.input_values == {}
    assert r.deployed_by is None
