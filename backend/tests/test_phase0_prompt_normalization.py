from __future__ import annotations

import sys
import types
from types import SimpleNamespace
from uuid import uuid4

import pytest

from openforge.api.prompts import PROMPT_CATALOGUE
from openforge.core.agent_registry import (
    COUNCIL_AGENT,
    OPTIMIZER_AGENT,
    ROUTER_AGENT,
    WORKSPACE_AGENT,
)
from openforge.services.conversation_service import conversation_service


class _FakeScalarList:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)


class _FakeResult:
    def __init__(self, *, scalar=None, scalars=None):
        self._scalar = scalar
        self._scalars = scalars

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return _FakeScalarList(self._scalars or [])


class _PromptAwareDB:
    def __init__(self, *, conversation, messages, prompt_override=None):
        self._conversation = conversation
        self._messages = list(messages)
        self._prompt_override = prompt_override
        self.commit_count = 0

    async def execute(self, query):
        sql = str(query)
        if "FROM messages" in sql:
            return _FakeResult(scalars=self._messages)
        if "FROM config" in sql:
            return _FakeResult(scalar=self._prompt_override)
        if "FROM conversations" in sql:
            return _FakeResult(scalar=self._conversation)
        raise AssertionError(f"Unexpected query: {sql}")

    async def commit(self):
        self.commit_count += 1


def test_prompt_catalogue_includes_phase0_full_sweep_entries() -> None:
    prompt_ids = {entry["id"] for entry in PROMPT_CATALOGUE}

    assert {
        "agent_system",
        "subagent_system",
        "conversation_title",
        "mention_conversation_summary",
        "router_system",
        "council_system",
        "optimizer_system",
        "knowledge_title_system",
        "audio_title_generation",
        "image_vision_analysis",
    }.issubset(prompt_ids)
    assert {
        "chat_system",
        "chat_rag_context",
        "conversation_summary",
        "bookmark_title",
        "entity_extraction",
    }.isdisjoint(prompt_ids)

    agent_prompt = next(entry for entry in PROMPT_CATALOGUE if entry["id"] == "agent_system")
    assert "[[knowledge:" in agent_prompt["default"]
    assert "[[chat:" in agent_prompt["default"]
    assert "[[workspace:" in agent_prompt["default"]


def test_system_agents_reference_catalogue_prompts_and_use_phase0_version() -> None:
    assert WORKSPACE_AGENT.system_prompt == "catalogue:agent_system"
    assert ROUTER_AGENT.system_prompt == "catalogue:router_system"
    assert COUNCIL_AGENT.system_prompt == "catalogue:council_system"
    assert OPTIMIZER_AGENT.system_prompt == "catalogue:optimizer_system"

    assert WORKSPACE_AGENT.version == "0.1.0"
    assert ROUTER_AGENT.version == "0.1.0"
    assert COUNCIL_AGENT.version == "0.1.0"
    assert OPTIMIZER_AGENT.version == "0.1.0"


@pytest.mark.asyncio
async def test_refresh_conversation_title_uses_catalogue_override(monkeypatch):
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
    ]
    prompt_override = SimpleNamespace(
        value={
            "text": (
                "CUSTOM conversation title prompt\n"
                "Current title: {current_title}\n"
                "Transcript:\n{recent_transcript}"
            )
        }
    )
    fake_db = _PromptAwareDB(
        conversation=conversation,
        messages=messages,
        prompt_override=prompt_override,
    )

    captured_messages = []

    async def _fake_chat(*_args, **kwargs):
        captured_messages.extend(kwargs["messages"])
        return "__KEEP__"

    async def _fake_send_to_workspace(*_args, **_kwargs):
        return None

    fake_llm_module = types.ModuleType("openforge.core.llm_gateway")
    fake_llm_module.llm_gateway = SimpleNamespace(chat=_fake_chat)
    monkeypatch.setitem(sys.modules, "openforge.core.llm_gateway", fake_llm_module)

    fake_ws_module = types.ModuleType("openforge.api.websocket")
    fake_ws_module.ws_manager = SimpleNamespace(send_to_workspace=_fake_send_to_workspace)
    monkeypatch.setitem(sys.modules, "openforge.api.websocket", fake_ws_module)

    title = await conversation_service.refresh_conversation_title(
        fake_db,
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        provider_name="ollama",
        api_key="",
        model="gpt-oss:20b",
        base_url="http://localhost:11434",
    )

    joined_content = "\n".join(str(message.get("content", "")) for message in captured_messages)

    assert title == "Kubernetes Rollout Plan"
    assert "CUSTOM conversation title prompt" in joined_content
