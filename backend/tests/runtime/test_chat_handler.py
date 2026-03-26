"""Tests for ChatHandler."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import importlib
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.domains.agents.compiled_spec import AgentRuntimeConfig
from openforge.db.models import Conversation, Message
chat_handler_module = importlib.import_module("openforge.runtime.chat_handler")
from openforge.runtime.chat_handler import ChatHandler, LoadedTools, chat_handler
from openforge.runtime.tool_loop import ToolLoopResult


class TestChatHandler:
    def test_singleton_exists(self):
        assert isinstance(chat_handler, ChatHandler)

    def test_cancel(self):
        handler = ChatHandler()
        conv_id = uuid.uuid4()
        import asyncio

        event = asyncio.Event()
        handler._cancel_events[str(conv_id)] = event

        assert not event.is_set()
        handler.cancel(conv_id)
        assert event.is_set()

    def test_cancel_no_event(self):
        handler = ChatHandler()
        # Should not raise
        handler.cancel(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_run_returns_agent_error_when_global_agent_cannot_be_resolved(self, monkeypatch):
        handler = ChatHandler()
        conversation_id = uuid.uuid4()
        agent_id = uuid.uuid4()

        conversation = SimpleNamespace(
            id=conversation_id,
            workspace_id=None,
            agent_id=agent_id,
            is_archived=False,
        )

        db = MagicMock()
        db.get = AsyncMock(side_effect=lambda model_cls, obj_id: conversation if model_cls is Conversation and obj_id == conversation_id else None)
        db.execute = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        publish_mock = AsyncMock()
        monkeypatch.setattr(handler, "_publish", publish_mock)
        monkeypatch.setattr(handler, "_should_use_redis", AsyncMock(return_value=False))
        monkeypatch.setattr(handler, "_subscribe_redis_cancel", AsyncMock(return_value=None))
        monkeypatch.setattr(chat_handler_module.agent_registry, "resolve", AsyncMock(return_value=None))
        monkeypatch.setattr(chat_handler_module.conversation_service, "add_message", AsyncMock())
        monkeypatch.setattr(chat_handler_module.llm_service, "get_provider_for_workspace", AsyncMock())
        monkeypatch.setattr(chat_handler_module.tool_dispatcher, "list_tools", AsyncMock())

        await handler.run(
            workspace_id=None,
            conversation_id=conversation_id,
            user_content="Tell me more.",
            db=db,
            execution_id=str(uuid.uuid4()),
        )

        publish_mock.assert_awaited()
        assert any(call.args[2] == "agent_error" for call in publish_mock.await_args_list)
        chat_handler_module.conversation_service.add_message.assert_not_awaited()
        chat_handler_module.llm_service.get_provider_for_workspace.assert_not_awaited()
        chat_handler_module.tool_dispatcher.list_tools.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_run_requests_follow_up_when_parameterized_inputs_are_missing(self, monkeypatch):
        handler = ChatHandler()
        conversation_id = uuid.uuid4()
        agent_id = uuid.uuid4()
        execution_id = str(uuid.uuid4())

        spec = AgentRuntimeConfig(
            agent_id=agent_id,
            agent_slug="deep-researcher",
            name="Deep Researcher",
            version="1.0.0",
            profile_id=uuid.uuid4(),
            provider_name="openai",
            model_name="gpt-4o-mini",
            tools_enabled=False,
            history_limit=2,
            attachment_support=False,
            system_prompt="You are a research assistant for {{topic}}.",
            system_prompt_template="You are a research assistant for {{topic}}.",
            input_schema=[
                {"name": "topic", "type": "text", "required": True},
                {"name": "audience", "type": "text", "required": True},
            ],
            is_parameterized=True,
            output_definitions=[{"key": "output", "type": "text"}],
            strategy="chat",

        )

        conversation = SimpleNamespace(
            id=conversation_id,
            workspace_id=None,
            agent_id=agent_id,
            is_archived=False,
        )
        user_message = SimpleNamespace(
            id=uuid.uuid4(),
            role="user",
            content="Research something broad.",
            created_at=datetime.now(timezone.utc),
        )
        follow_up_message = SimpleNamespace(
            id=uuid.uuid4(),
            role="assistant",
            content="What topic and audience should I use?",
            created_at=datetime.now(timezone.utc),
        )
        history = [
            {"role": "assistant", "content": "What topic and audience should I use?"},
            {"role": "user", "content": "Research something broad."},
        ]

        db = MagicMock()

        async def fake_get(model_cls, obj_id):
            if model_cls is Conversation and obj_id == conversation_id:
                return conversation
            return None

        class _Result:
            def scalar_one_or_none(self):
                return user_message

        db.get = AsyncMock(side_effect=fake_get)
        db.execute = AsyncMock(return_value=_Result())
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        publish_mock = AsyncMock()
        update_execution_record_mock = AsyncMock()
        monkeypatch.setattr(handler, "_publish", publish_mock)
        monkeypatch.setattr(handler, "_update_execution_record", update_execution_record_mock)
        monkeypatch.setattr(handler, "_should_use_redis", AsyncMock(return_value=False))
        monkeypatch.setattr(handler, "_subscribe_redis_cancel", AsyncMock(return_value=None))
        monkeypatch.setattr(chat_handler_module.agent_registry, "resolve", AsyncMock(return_value=spec))
        monkeypatch.setattr(chat_handler_module.agent_registry, "list_available_agents", AsyncMock(return_value=[]))
        monkeypatch.setattr(chat_handler_module.conversation_service, "get_recent_messages", AsyncMock(return_value=history))
        monkeypatch.setattr(chat_handler_module.conversation_service, "add_message", AsyncMock(return_value=follow_up_message))
        monkeypatch.setattr(chat_handler_module.llm_service, "get_provider_for_workspace", AsyncMock(return_value=("openai", "test-key", "gpt-4o-mini", None)))
        extract_mock = AsyncMock(return_value={
            "extracted": {},
            "missing": ["topic", "audience"],
            "follow_up": "What topic and audience should I use?",
            "all_filled": False,
        })
        monkeypatch.setattr(chat_handler_module, "extract_parameter_values", extract_mock)
        monkeypatch.setattr(chat_handler_module.tool_dispatcher, "list_tools", AsyncMock())

        await handler.run(
            workspace_id=None,
            conversation_id=conversation_id,
            user_content="Research something broad.",
            db=db,
            execution_id=execution_id,
        )

        chat_handler_module.conversation_service.add_message.assert_awaited()
        follow_up_call = chat_handler_module.conversation_service.add_message.await_args_list[0]
        assert follow_up_call.kwargs["role"] == "assistant"
        assert follow_up_call.kwargs["content"] == "What topic and audience should I use?"
        assert follow_up_call.kwargs["trigger_auto_title"] is False
        assert extract_mock.await_args.kwargs["conversation_history"] == history
        assert any(call.kwargs.get("status") == "paused" for call in update_execution_record_mock.await_args_list)
        assert not any(call.args[2] == "execution_completed" for call in publish_mock.await_args_list)
        assert any(call.args[2] == "agent_done" for call in publish_mock.await_args_list)

    @pytest.mark.asyncio
    async def test_run_renders_parameterized_system_prompt_before_generation(self, monkeypatch):
        handler = ChatHandler()
        conversation_id = uuid.uuid4()
        agent_id = uuid.uuid4()
        execution_id = str(uuid.uuid4())

        spec = AgentRuntimeConfig(
            agent_id=agent_id,
            agent_slug="deep-researcher",
            name="Deep Researcher",
            version="1.0.0",
            profile_id=uuid.uuid4(),
            provider_name="openai",
            model_name="gpt-4o-mini",
            tools_enabled=False,
            history_limit=2,
            attachment_support=False,
            system_prompt="You are a research assistant for {{topic}}.",
            system_prompt_template="You are a research assistant for {{topic}}.",
            input_schema=[
                {"name": "topic", "type": "text", "required": True},
            ],
            is_parameterized=True,
            output_definitions=[{"key": "output", "type": "text"}],
            strategy="chat",

        )

        conversation = SimpleNamespace(
            id=conversation_id,
            workspace_id=None,
            agent_id=agent_id,
            is_archived=False,
        )
        user_message = SimpleNamespace(
            id=uuid.uuid4(),
            role="user",
            content="Research AI alignment.",
            created_at=datetime.now(timezone.utc),
        )
        assistant_message = SimpleNamespace(
            id=uuid.uuid4(),
            role="assistant",
            content="done",
            created_at=datetime.now(timezone.utc),
            timeline=[],
        )
        captured_messages: list[list[dict]] = []

        db = MagicMock()

        async def fake_get(model_cls, obj_id):
            if model_cls is Conversation and obj_id == conversation_id:
                return conversation
            return None

        class _ScalarResult:
            def __init__(self, value):
                self._value = value

            def scalar_one_or_none(self):
                return self._value

        class _RowsResult:
            def __init__(self, rows):
                self._rows = rows

            def scalars(self):
                return SimpleNamespace(all=lambda: list(self._rows))

        db.get = AsyncMock(side_effect=fake_get)
        db.execute = AsyncMock(side_effect=[
            _ScalarResult(user_message),
            _ScalarResult(None),
            _RowsResult([]),
        ])
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        async def fake_execute_tool_loop(*, messages, **_kwargs):
            captured_messages.append(messages)
            return ToolLoopResult(full_response="done", full_thinking="", tool_calls=[], timeline=[], was_cancelled=False, intermediate_response_total=0)

        publish_mock = AsyncMock()
        monkeypatch.setattr(handler, "_publish", publish_mock)
        monkeypatch.setattr(handler, "_should_use_redis", AsyncMock(return_value=False))
        monkeypatch.setattr(handler, "_subscribe_redis_cancel", AsyncMock(return_value=None))
        monkeypatch.setattr(chat_handler_module.agent_registry, "resolve", AsyncMock(return_value=spec))
        monkeypatch.setattr(chat_handler_module.agent_registry, "list_available_agents", AsyncMock(return_value=[]))
        monkeypatch.setattr(chat_handler_module.conversation_service, "get_recent_messages", AsyncMock(return_value=[]))
        monkeypatch.setattr(chat_handler_module.conversation_service, "add_message", AsyncMock(return_value=assistant_message))
        monkeypatch.setattr(chat_handler_module.llm_service, "get_provider_for_workspace", AsyncMock(return_value=("openai", "test-key", "gpt-4o-mini", None)))
        monkeypatch.setattr(chat_handler_module, "extract_parameter_values", AsyncMock(return_value={
            "extracted": {"topic": "AI alignment"},
            "missing": [],
            "follow_up": None,
            "all_filled": True,
        }))
        monkeypatch.setattr("openforge.runtime.tool_loop.execute_tool_loop", fake_execute_tool_loop)
        monkeypatch.setattr(chat_handler_module.tool_dispatcher, "list_tools", AsyncMock())

        await handler.run(
            workspace_id=None,
            conversation_id=conversation_id,
            user_content="Research AI alignment.",
            db=db,
            execution_id=execution_id,
        )

        assert captured_messages
        assert "AI alignment" in captured_messages[0][0]["content"]
        chat_handler_module.conversation_service.add_message.assert_awaited()
        assert chat_handler_module.conversation_service.add_message.await_args_list[-1].kwargs["content"] == "done"

    @pytest.mark.asyncio
    async def test_run_requests_final_summary_when_only_intermediate_responses_exist(self, monkeypatch):
        handler = ChatHandler()
        conversation_id = uuid.uuid4()
        agent_id = uuid.uuid4()
        execution_id = str(uuid.uuid4())
        intermediate_content = "Need another search pass."

        spec = AgentRuntimeConfig(
            agent_id=agent_id,
            agent_slug="deep-researcher",
            name="Deep Researcher",
            version="1.0.0",
            profile_id=uuid.uuid4(),
            provider_name="openai",
            model_name="gpt-4o-mini",
            tools_enabled=False,
            history_limit=2,
            attachment_support=False,
            system_prompt="You are a research assistant for {{topic}}.",
            system_prompt_template="You are a research assistant for {{topic}}.",
            input_schema=[
                {"name": "topic", "type": "text", "required": True},
            ],
            is_parameterized=True,
            output_definitions=[{"key": "output", "type": "text"}],
            strategy="chat",

        )

        conversation = SimpleNamespace(
            id=conversation_id,
            workspace_id=None,
            agent_id=agent_id,
            is_archived=False,
        )
        user_message = SimpleNamespace(
            id=uuid.uuid4(),
            role="user",
            content="Research AI alignment.",
            created_at=datetime.now(timezone.utc),
        )
        assistant_message = SimpleNamespace(
            id=uuid.uuid4(),
            role="assistant",
            content="Final summary.",
            created_at=datetime.now(timezone.utc),
            timeline=[],
        )
        captured_summary_kwargs: dict[str, object] = {}

        db = MagicMock()

        async def fake_get(model_cls, obj_id):
            if model_cls is Conversation and obj_id == conversation_id:
                return conversation
            return None

        class _ScalarResult:
            def __init__(self, value):
                self._value = value

            def scalar_one_or_none(self):
                return self._value

        class _RowsResult:
            def __init__(self, rows):
                self._rows = rows

            def scalars(self):
                return SimpleNamespace(all=lambda: list(self._rows))

        db.get = AsyncMock(side_effect=fake_get)
        db.execute = AsyncMock(side_effect=[
            _ScalarResult(user_message),
            _ScalarResult(None),
            _RowsResult([]),
        ])
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        async def fake_execute_tool_loop(**_kwargs):
            return ToolLoopResult(
                full_response=intermediate_content,
                full_thinking="",
                tool_calls=[{"call_id": "call-1", "tool_name": "workspace.search", "arguments": {"query": "AI alignment"}}],
                timeline=[{"type": "intermediate_response", "content": intermediate_content}],
                was_cancelled=False,
                intermediate_response_total=len(intermediate_content),
            )

        async def fake_stream_with_tools(*args, **kwargs):
            captured_summary_kwargs.update(kwargs)
            yield {"type": "token", "content": "Final summary."}
            yield {"type": "done", "finish_reason": "stop"}

        monkeypatch.setattr(handler, "_publish", AsyncMock())
        monkeypatch.setattr(handler, "_update_stream_state", AsyncMock())
        monkeypatch.setattr(handler, "_update_execution_record", AsyncMock())
        monkeypatch.setattr(handler, "_should_use_redis", AsyncMock(return_value=False))
        monkeypatch.setattr(handler, "_subscribe_redis_cancel", AsyncMock(return_value=None))
        monkeypatch.setattr(chat_handler_module.agent_registry, "resolve", AsyncMock(return_value=spec))
        monkeypatch.setattr(chat_handler_module.agent_registry, "list_available_agents", AsyncMock(return_value=[]))
        monkeypatch.setattr(chat_handler_module.conversation_service, "get_recent_messages", AsyncMock(return_value=[]))
        monkeypatch.setattr(chat_handler_module.conversation_service, "add_message", AsyncMock(return_value=assistant_message))
        monkeypatch.setattr(chat_handler_module.llm_service, "get_provider_for_workspace", AsyncMock(return_value=("openai", "test-key", "gpt-4o-mini", None)))
        monkeypatch.setattr(chat_handler_module, "extract_parameter_values", AsyncMock(return_value={
            "extracted": {"topic": "AI alignment"},
            "missing": [],
            "follow_up": None,
            "all_filled": True,
        }))
        monkeypatch.setattr("openforge.runtime.tool_loop.execute_tool_loop", fake_execute_tool_loop)
        monkeypatch.setattr(chat_handler_module.tool_dispatcher, "list_tools", AsyncMock())
        monkeypatch.setattr(chat_handler_module.llm_gateway, "stream_with_tools", fake_stream_with_tools)
        monkeypatch.setattr(chat_handler_module.llm_gateway, "count_tokens", MagicMock(return_value=2))

        await handler.run(
            workspace_id=None,
            conversation_id=conversation_id,
            user_content="Research AI alignment.",
            db=db,
            execution_id=execution_id,
        )

        assert captured_summary_kwargs["tools"] == []
        assert captured_summary_kwargs["include_thinking"] is False
        chat_handler_module.conversation_service.add_message.assert_awaited()
        assert chat_handler_module.conversation_service.add_message.await_args_list[-1].kwargs["content"] == "Final summary."


class TestLoadedTools:
    def test_construction(self):
        tools = LoadedTools(
            openai_tools=[{"type": "function", "function": {"name": "test"}}],
            fn_name_to_tool_info={"test": {"type": "builtin", "tool_id": "test.tool"}},
        )
        assert len(tools.openai_tools) == 1
        assert "test" in tools.fn_name_to_tool_info


