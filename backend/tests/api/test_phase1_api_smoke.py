"""
Phase 1 API Smoke Tests

Tests to verify that new domain APIs are accessible.
"""

import pytest
from fastapi.testclient import TestClient

from openforge.main import app


client = TestClient(app)


def test_profiles_api_list():
    """Test that profiles API list endpoint is accessible."""
    response = client.get("/api/v1/profiles")
    # Should return 200 (even if empty list)
    assert response.status_code == 200


def test_workflows_api_list():
    """Test that workflows API list endpoint is accessible."""
    response = client.get("/api/v1/workflows")
    assert response.status_code == 200


def test_missions_api_list():
    """Test that missions API list endpoint is accessible."""
    response = client.get("/api/v1/missions")
    assert response.status_code == 200


def test_triggers_api_list():
    """Test that triggers API list endpoint is accessible."""
    response = client.get("/api/v1/triggers")
    assert response.status_code == 200


def test_runs_api_list():
    """Test that runs API list endpoint is accessible."""
    response = client.get("/api/v1/runs")
    assert response.status_code == 200


def test_artifacts_api_list():
    """Test that artifacts API list endpoint is accessible."""
    response = client.get("/api/v1/artifacts")
    assert response.status_code == 200


def test_profiles_api_create_validation():
    """Test that profiles API validates create requests."""
    response = client.post("/api/v1/profiles", json={})
    # Should return 422 (validation error)
    assert response.status_code == 422


def test_workflows_api_create_validation():
    """Test that workflows API validates create requests."""
    response = client.post("/api/v1/workflows", json={})
    assert response.status_code == 422


def test_missions_api_create_validation():
    """Test that missions API validates create requests."""
    response = client.post("/api/v1/missions", json={})
    assert response.status_code == 422
