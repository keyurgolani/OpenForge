from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from openforge.services.conversation_service import conversation_service


class _FakeScalarList:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _FakeResult:
    def __init__(self, *, scalar=None, scalars=None):
        self._scalar = scalar
        self._scalars = scalars

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return _FakeScalarList(self._scalars or [])


class _FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.commit_count = 0

    async def execute(self, _query):
        if not self._results:
            raise AssertionError("No fake results left for execute()")
        return self._results.pop(0)

    async def commit(self):
        self.commit_count += 1


@pytest.mark.asyncio
async def test_refresh_conversation_title_falls_back_when_llm_errors(monkeypatch):
    workspace_id = uuid4()
    conversation_id = uuid4()

    conversation = SimpleNamespace(
        id=conversation_id,
        title=None,
        title_locked=False,
    )
    user_message = SimpleNamespace(role="user", content="Plan migration from docker compose to kubernetes this week")
    assistant_message = SimpleNamespace(role="assistant", content="Let's break this down by timeline and risk.")

    fake_db = _FakeDB(
        [
            _FakeResult(scalar=conversation),  # initial conversation lookup
            _FakeResult(scalars=[user_message, assistant_message]),  # message window
            _FakeResult(scalar=conversation),  # lock/title re-check before write
        ]
    )

    async def _raise_llm_error(*_args, **_kwargs):
        raise RuntimeError("llm unavailable")

    sent_events = []

    async def _fake_send_to_workspace(workspace: str, payload: dict):
        sent_events.append((workspace, payload))

    monkeypatch.setattr("openforge.core.llm_gateway.llm_gateway.chat", _raise_llm_error)
    monkeypatch.setattr("openforge.api.websocket.ws_manager.send_to_workspace", _fake_send_to_workspace)

    title = await conversation_service.refresh_conversation_title(
        fake_db,
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        provider_name="ollama",
        api_key="",
        model="gpt-oss:20b",
        base_url="http://localhost:11434",
    )

    assert title == "Plan migration from docker compose to kubernetes"
    assert conversation.title == "Plan migration from docker compose to kubernetes"
    assert fake_db.commit_count == 1
    assert sent_events == [
        (
            str(workspace_id),
            {
                "type": "conversation_updated",
                "conversation_id": str(conversation_id),
                "fields": ["title"],
            },
        )
    ]
