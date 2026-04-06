from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from openforge.runtime import input_extraction


@pytest.mark.asyncio
async def test_extract_parameter_values_calls_llm_and_parses_response(monkeypatch):
    captured = {}

    async def fake_chat(**kwargs):
        captured.update(kwargs)
        return '{"extracted": {"topic": "AI"}, "missing": [], "follow_up": null}'

    monkeypatch.setattr(input_extraction.llm_gateway, "chat", fake_chat)

    schema = [
        {"name": "topic", "type": "text", "required": True, "description": "Topic to research"},
    ]

    result = await input_extraction.extract_parameter_values(
        schema,
        "Research AI alignment",
        provider_name="openai",
        api_key="test-key",
        model="gpt-4o-mini",
    )

    assert result["all_filled"] is True
    assert result["extracted"]["topic"] == "AI"
    assert captured["messages"][0]["role"] == "user"
    assert "Research AI alignment" in captured["messages"][0]["content"]


@pytest.mark.asyncio
async def test_extract_parameter_values_includes_recent_conversation_history(monkeypatch):
    captured = {}

    async def fake_chat(**kwargs):
        captured.update(kwargs)
        return '{"extracted": {"topic": "AI safety", "audience": "executives"}, "missing": [], "follow_up": null}'

    monkeypatch.setattr(input_extraction.llm_gateway, "chat", fake_chat)

    schema = [
        {"name": "topic", "type": "text", "required": True},
        {"name": "audience", "type": "text", "required": True},
    ]
    history = [
        {"role": "assistant", "content": "What topic and audience should I use?"},
        {"role": "user", "content": "The topic is AI safety."},
    ]

    result = await input_extraction.extract_parameter_values(
        schema,
        "Make it for executives.",
        conversation_history=history,
        provider_name="openai",
        api_key="test-key",
        model="gpt-4o-mini",
    )

    prompt = captured["messages"][0]["content"]
    assert "ASSISTANT: What topic and audience should I use?" in prompt
    assert "USER: The topic is AI safety." in prompt
    assert 'Latest user message: "Make it for executives."' in prompt
    assert result["extracted"] == {"topic": "AI safety", "audience": "executives"}


@pytest.mark.asyncio
async def test_extract_parameter_values_falls_back_on_llm_error(monkeypatch):
    async def fake_chat(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(input_extraction.llm_gateway, "chat", fake_chat)

    schema = [
        {"name": "topic", "type": "text", "required": True, "description": "Topic to research"},
        {"name": "audience", "type": "text", "required": True},
    ]

    result = await input_extraction.extract_parameter_values(
        schema,
        "Research AI alignment",
        provider_name="openai",
        api_key="test-key",
        model="gpt-4o-mini",
    )

    assert result["all_filled"] is False
    assert result["missing"] == ["topic", "audience"]
    assert result["follow_up"] is None
    assert result.get("extraction_failed") is True
