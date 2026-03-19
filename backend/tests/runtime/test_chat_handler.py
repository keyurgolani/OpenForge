"""Tests for ChatHandler."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.chat_handler import ChatHandler, LoadedTools, chat_handler


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


class TestLoadedTools:
    def test_construction(self):
        tools = LoadedTools(
            openai_tools=[{"type": "function", "function": {"name": "test"}}],
            fn_name_to_tool_info={"test": {"type": "builtin", "tool_id": "test.tool"}},
        )
        assert len(tools.openai_tools) == 1
        assert "test" in tools.fn_name_to_tool_info
