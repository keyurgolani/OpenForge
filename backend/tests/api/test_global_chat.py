from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from openforge.api import global_chat
from openforge.db.models import AgentModel


class _DBOverride:
    def __init__(self, db):
        self.db = db

    async def __call__(self):
        yield self.db


def _new_app() -> FastAPI:
    app = FastAPI()
    app.include_router(global_chat.router)
    return app


def test_create_global_conversation_rejects_agent_without_active_version(monkeypatch):
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        name="Deep Researcher",
        active_version_id=None,
    )

    db = SimpleNamespace(
        get=AsyncMock(return_value=agent),
        add=lambda _obj: None,
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    resolve_mock = AsyncMock(return_value=object())
    monkeypatch.setattr(global_chat.agent_registry, "resolve", resolve_mock)

    app = _new_app()
    app.dependency_overrides[global_chat.get_db] = _DBOverride(db)
    client = TestClient(app)

    response = client.post("/conversations", json={"agent_id": str(agent_id)})

    assert response.status_code == 400
    assert "no active version" in response.json()["detail"].lower()
    resolve_mock.assert_not_awaited()


def test_create_global_conversation_rejects_unresolved_spec(monkeypatch):
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        name="Deep Researcher",
        active_version_id=uuid4(),
    )

    db = SimpleNamespace(
        get=AsyncMock(return_value=agent),
        add=lambda _obj: None,
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    resolve_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(global_chat.agent_registry, "resolve", resolve_mock)

    app = _new_app()
    app.dependency_overrides[global_chat.get_db] = _DBOverride(db)
    client = TestClient(app)

    response = client.post("/conversations", json={"agent_id": str(agent_id)})

    assert response.status_code == 400
    assert "ready for global chat" in response.json()["detail"].lower()
    resolve_mock.assert_awaited_once()


def test_create_global_conversation_accepts_eligible_agent(monkeypatch):
    agent_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        name="Deep Researcher",
        active_version_id=uuid4(),
    )

    added: list[object] = []

    db = SimpleNamespace(
        get=AsyncMock(return_value=agent),
        add=lambda obj: added.append(obj),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    resolve_mock = AsyncMock(return_value=object())
    monkeypatch.setattr(global_chat.agent_registry, "resolve", resolve_mock)

    app = _new_app()
    app.dependency_overrides[global_chat.get_db] = _DBOverride(db)
    client = TestClient(app)

    response = client.post("/conversations", json={"agent_id": str(agent_id)})

    assert response.status_code == 201
    payload = response.json()
    assert payload["agent_id"] == str(agent_id)
    assert payload["title"] == ""
    assert added and getattr(added[0], "agent_id", None) == agent_id
    resolve_mock.assert_awaited_once()
