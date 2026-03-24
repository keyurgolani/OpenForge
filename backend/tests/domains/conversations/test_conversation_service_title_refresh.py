from __future__ import annotations

import sys
import types
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


def _stub_runtime_modules(monkeypatch, *, chat_impl, send_impl):
    fake_llm_module = types.ModuleType("openforge.core.llm_gateway")
    fake_llm_module.llm_gateway = SimpleNamespace(chat=chat_impl)
    monkeypatch.setitem(sys.modules, "openforge.core.llm_gateway", fake_llm_module)

    fake_ws_module = types.ModuleType("openforge.api.websocket")
    fake_ws_module.ws_manager = SimpleNamespace(send_to_workspace=send_impl)
    monkeypatch.setitem(sys.modules, "openforge.api.websocket", fake_ws_module)


@pytest.mark.xfail(reason="Prompt catalogue removed; conversation_title prompt not available")
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
            _FakeResult(scalar=None),  # prompt override lookup
            _FakeResult(scalar=conversation),  # lock/title re-check before write
        ]
    )

    async def _raise_llm_error(*_args, **_kwargs):
        raise RuntimeError("llm unavailable")

    sent_events = []

    async def _fake_send_to_workspace(workspace: str, payload: dict):
        sent_events.append((workspace, payload))

    _stub_runtime_modules(
        monkeypatch,
        chat_impl=_raise_llm_error,
        send_impl=_fake_send_to_workspace,
    )

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


@pytest.mark.xfail(reason="Prompt catalogue removed; conversation_title prompt not available")
@pytest.mark.asyncio
async def test_refresh_conversation_title_ignores_low_signal_generated_title(monkeypatch):
    workspace_id = uuid4()
    conversation_id = uuid4()

    conversation = SimpleNamespace(
        id=conversation_id,
        title=None,
        title_locked=False,
    )
    messages = [
        SimpleNamespace(role="user", content="Plan migration from docker compose to kubernetes with rollback"),
        SimpleNamespace(role="assistant", content="We should phase this by risk and rollout windows."),
        SimpleNamespace(role="user", content="thank you and you're great"),
        SimpleNamespace(role="assistant", content="You're welcome!"),
    ]

    fake_db = _FakeDB(
        [
            _FakeResult(scalar=conversation),  # initial conversation lookup
            _FakeResult(scalars=messages),  # message window
            _FakeResult(scalar=None),  # prompt override lookup
            _FakeResult(scalar=conversation),  # lock/title re-check before write
        ]
    )

    async def _fake_chat(*_args, **_kwargs):
        return "Thank you and you're great"

    sent_events = []

    async def _fake_send_to_workspace(workspace: str, payload: dict):
        sent_events.append((workspace, payload))

    _stub_runtime_modules(
        monkeypatch,
        chat_impl=_fake_chat,
        send_impl=_fake_send_to_workspace,
    )

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


@pytest.mark.asyncio
async def test_refresh_conversation_title_keeps_existing_title_when_model_returns_keep(monkeypatch):
    workspace_id = uuid4()
    conversation_id = uuid4()

    conversation = SimpleNamespace(
        id=conversation_id,
        title="Kubernetes Rollout Plan",
        title_locked=False,
    )
    messages = [
        SimpleNamespace(role="user", content="Plan migration from docker compose to kubernetes with rollback"),
        SimpleNamespace(role="assistant", content="Let's split this into assessment, rollout, and rollback phases."),
        SimpleNamespace(role="user", content="thank you and you're great"),
        SimpleNamespace(role="assistant", content="You're welcome!"),
    ]

    fake_db = _FakeDB(
        [
            _FakeResult(scalar=conversation),  # initial conversation lookup
            _FakeResult(scalars=messages),  # message window
            _FakeResult(scalar=None),  # prompt override lookup
        ]
    )

    async def _fake_chat(*_args, **_kwargs):
        return "__KEEP__"

    sent_events = []

    async def _fake_send_to_workspace(workspace: str, payload: dict):
        sent_events.append((workspace, payload))

    _stub_runtime_modules(
        monkeypatch,
        chat_impl=_fake_chat,
        send_impl=_fake_send_to_workspace,
    )

    title = await conversation_service.refresh_conversation_title(
        fake_db,
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        provider_name="ollama",
        api_key="",
        model="gpt-oss:20b",
        base_url="http://localhost:11434",
    )

    assert title == "Kubernetes Rollout Plan"
    assert conversation.title == "Kubernetes Rollout Plan"
    assert fake_db.commit_count == 0
    assert sent_events == []


@pytest.mark.xfail(reason="Prompt catalogue removed; conversation_title prompt not available")
@pytest.mark.asyncio
async def test_refresh_conversation_title_rewrites_request_style_generated_title(monkeypatch):
    workspace_id = uuid4()
    conversation_id = uuid4()

    conversation = SimpleNamespace(
        id=conversation_id,
        title=None,
        title_locked=False,
    )
    messages = [
        SimpleNamespace(role="user", content="Tell me a long long story about dragons and kingdoms"),
        SimpleNamespace(role="assistant", content="Here's a sweeping saga with world-building and major arcs."),
    ]

    fake_db = _FakeDB(
        [
            _FakeResult(scalar=conversation),  # initial conversation lookup
            _FakeResult(scalars=messages),  # message window
            _FakeResult(scalar=None),  # prompt override lookup
            _FakeResult(scalar=conversation),  # lock/title re-check before write
        ]
    )

    async def _fake_chat(*_args, **_kwargs):
        return "Tell me a long long story about dragons"

    sent_events = []

    async def _fake_send_to_workspace(workspace: str, payload: dict):
        sent_events.append((workspace, payload))

    _stub_runtime_modules(
        monkeypatch,
        chat_impl=_fake_chat,
        send_impl=_fake_send_to_workspace,
    )

    title = await conversation_service.refresh_conversation_title(
        fake_db,
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        provider_name="ollama",
        api_key="",
        model="gpt-oss:20b",
        base_url="http://localhost:11434",
    )

    assert title == "A long long story about dragons"
    assert conversation.title == "A long long story about dragons"
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
