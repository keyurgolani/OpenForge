from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
import asyncio
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

# Search API imports openforge.core.embedding -> sentence_transformers.
# Stub it so integration tests don't need heavyweight ML deps.
if "sentence_transformers" not in sys.modules:
    fake_st = types.ModuleType("sentence_transformers")

    class _FakeSentenceTransformer:
        def __init__(self, *_args, **_kwargs):
            pass

        def encode(self, *_args, **_kwargs):
            return [0.0]

        def get_sentence_embedding_dimension(self):
            return 384

    fake_st.SentenceTransformer = _FakeSentenceTransformer
    sys.modules["sentence_transformers"] = fake_st

from openforge.api import conversations as conversations_api
from openforge.api import search as search_api
from openforge.api import tasks as tasks_api
from openforge.db.models import Config, TaskLog


class _FakeScalars:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeResult:
    def __init__(self, *, one=None, rows=None):
        self._one = one
        self._rows = [] if rows is None else list(rows)

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return _FakeScalars(self._rows)


class _QueueDB:
    """Returns queued execute() results in call order."""

    def __init__(self, execute_results):
        self._execute_results = list(execute_results)
        self.added = []
        self.commits = 0
        self.refreshed = []

    async def execute(self, _query):
        if not self._execute_results:
            raise AssertionError("Unexpected execute() call with empty result queue")
        return self._execute_results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshed.append(obj)


class _DBOverride:
    def __init__(self, db):
        self.db = db

    async def __call__(self):
        yield self.db


def _new_app_with_router(router) -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    return app


def _conversation_payload(workspace_id: str, conv_id: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": conv_id,
        "workspace_id": workspace_id,
        "title": "Conversation",
        "title_locked": False,
        "is_pinned": False,
        "is_archived": False,
        "archived_at": None,
        "message_count": 1,
        "last_message_at": now,
        "last_message_preview": "Hello",
        "created_at": now,
        "updated_at": now,
    }


def test_conversations_router_end_to_end_with_service_mocks(monkeypatch):
    workspace_id = str(uuid4())
    conversation_id = str(uuid4())

    list_mock = AsyncMock(return_value=[_conversation_payload(workspace_id, conversation_id)])
    create_mock = AsyncMock(return_value=_conversation_payload(workspace_id, conversation_id))
    get_mock = AsyncMock(return_value={
        **_conversation_payload(workspace_id, conversation_id),
        "messages": [
            {
                "id": str(uuid4()),
                "conversation_id": conversation_id,
                "role": "user",
                "content": "Hi",
                "thinking": None,
                "model_used": None,
                "provider_used": None,
                "token_count": None,
                "generation_ms": None,
                "context_sources": None,
                "attachments_processed": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
    })
    update_mock = AsyncMock(return_value=_conversation_payload(workspace_id, conversation_id))
    delete_mock = AsyncMock(return_value=None)
    perm_delete_mock = AsyncMock(return_value=None)

    monkeypatch.setattr(conversations_api.conversation_service, "list_conversations", list_mock)
    monkeypatch.setattr(conversations_api.conversation_service, "create_conversation", create_mock)
    monkeypatch.setattr(conversations_api.conversation_service, "get_conversation_with_messages", get_mock)
    monkeypatch.setattr(conversations_api.conversation_service, "update_conversation", update_mock)
    monkeypatch.setattr(conversations_api.conversation_service, "delete_conversation", delete_mock)
    monkeypatch.setattr(conversations_api.conversation_service, "permanently_delete_conversation", perm_delete_mock)

    app = _new_app_with_router(conversations_api.router)
    app.dependency_overrides[conversations_api.get_db] = _DBOverride(object())
    client = TestClient(app)

    r = client.get(f"/{workspace_id}/conversations")
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = client.post(f"/{workspace_id}/conversations", json={"title": "New"})
    assert r.status_code == 201
    assert r.json()["id"] == conversation_id

    r = client.get(f"/{workspace_id}/conversations/{conversation_id}?include_archived=true")
    assert r.status_code == 200
    assert r.json()["messages"][0]["content"] == "Hi"

    r = client.put(f"/{workspace_id}/conversations/{conversation_id}", json={"title": "Renamed", "title_locked": True})
    assert r.status_code == 200

    r = client.delete(f"/{workspace_id}/conversations/{conversation_id}")
    assert r.status_code == 204

    r = client.delete(f"/{workspace_id}/conversations/{conversation_id}/permanent")
    assert r.status_code == 204


def test_search_router_highlights_terms(monkeypatch):
    workspace_id = str(uuid4())
    knowledge_id = str(uuid4())

    monkeypatch.setattr(
        search_api.search_engine,
        "search_deduplicated",
        lambda **kwargs: [
            {
                "knowledge_id": knowledge_id,
                "title": "Release Notes",
                "knowledge_type": "note",
                "chunk_text": "This release improves testing reliability.",
                "header_path": "Changelog",
                "tags": ["release"],
                "score": 0.92,
                "created_at": "2026-03-07T00:00:00Z",
            }
        ],
    )

    app = _new_app_with_router(search_api.router)
    app.dependency_overrides[search_api.get_db] = _DBOverride(object())
    client = TestClient(app)

    r = client.get(f"/{workspace_id}/search", params={"q": "release testing", "mode": "search", "limit": 10})
    assert r.status_code == 200
    payload = r.json()
    assert payload["total"] == 1
    assert "<mark>release</mark>" in payload["results"][0]["highlighted_text"].lower()
    assert "<mark>testing</mark>" in payload["results"][0]["highlighted_text"].lower()


def test_tasks_routes_list_update_run_and_history(monkeypatch):
    now = datetime.now(timezone.utc)
    schedule_cfg = Config(
        key="schedule.extract_bookmark_content",
        value={"enabled": False, "interval_hours": 4, "target_scope": "all"},
        category="schedule",
        sensitive=False,
    )

    last_log = TaskLog(task_type="extract_bookmark_content", status="done", started_at=now)

    # list_schedules:
    # 1 execute for config rows, then one execute per task catalogue row for last log
    list_db = _QueueDB([
        _FakeResult(rows=[schedule_cfg]),
        _FakeResult(one=last_log),
        _FakeResult(one=None),
        _FakeResult(one=None),
        _FakeResult(one=None),
        _FakeResult(one=None),
    ])

    app = _new_app_with_router(tasks_api.router)
    app.dependency_overrides[tasks_api.get_db] = _DBOverride(list_db)
    client = TestClient(app)

    r = client.get("/schedules")
    assert r.status_code == 200
    schedules = r.json()
    assert len(schedules) == len(tasks_api.TASK_CATALOGUE)
    bookmark = next(s for s in schedules if s["id"] == "extract_bookmark_content")
    assert bookmark["enabled"] is False
    assert bookmark["interval_hours"] == 4
    assert bookmark["target_scope"] == "all"

    # update_schedule
    update_db = _QueueDB([
        _FakeResult(one=None),  # existing schedule row lookup
        _FakeResult(one=last_log),  # last run lookup
    ])
    app.dependency_overrides[tasks_api.get_db] = _DBOverride(update_db)

    r = client.put("/schedules/embed_knowledge", json={"enabled": False, "interval_hours": 2})
    assert r.status_code == 200
    updated = r.json()
    assert updated["enabled"] is False
    assert updated["interval_hours"] == 2
    assert len(update_db.added) == 1
    assert isinstance(update_db.added[0], Config)

    # run task now (using task without target scope to avoid extra DB resolution)
    run_db = _QueueDB([
        _FakeResult(one=None),  # schedule config lookup
    ])
    app.dependency_overrides[tasks_api.get_db] = _DBOverride(run_db)

    def _fake_create_task(coro):
        # Prevent background execution in test while still exercising scheduling path.
        coro.close()
        return SimpleNamespace(done=lambda: True)

    monkeypatch.setattr(asyncio, "create_task", _fake_create_task)

    r = client.post("/schedules/embed_knowledge/run", json={"workspace_id": str(uuid4())})
    assert r.status_code == 200
    body = r.json()
    assert "started" in body["message"].lower()
    assert len(run_db.added) == 1
    assert isinstance(run_db.added[0], TaskLog)

    # history
    history_log = TaskLog(task_type="embed_knowledge", status="done", started_at=now)
    history_db = _QueueDB([
        _FakeResult(rows=[history_log]),
    ])
    app.dependency_overrides[tasks_api.get_db] = _DBOverride(history_db)

    r = client.get("/history", params={"limit": 10})
    assert r.status_code == 200
    assert r.json()[0]["task_type"] == "embed_knowledge"
