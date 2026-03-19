"""Tests for tool_loop shared execution layer."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from openforge.runtime.tool_loop import (
    ToolLoopCallbacks,
    ToolLoopContext,
    ToolLoopResult,
    execute_tool_loop,
)


class TestToolLoopTypes:
    def test_context_defaults(self):
        ctx = ToolLoopContext(
            workspace_id=uuid.uuid4(),
            conversation_id=None,
            execution_id="test-exec",
        )
        assert ctx.agent_spec is None
        assert not ctx.cancel_event.is_set()

    def test_callbacks_defaults(self):
        callbacks = ToolLoopCallbacks()
        assert callbacks.on_thinking is None
        assert callbacks.on_token is None
        assert callbacks.on_tool_start is None

    def test_result_defaults(self):
        result = ToolLoopResult()
        assert result.full_response == ""
        assert result.full_thinking == ""
        assert result.tool_calls == []
        assert result.timeline == []
        assert result.was_cancelled is False


class TestExecuteToolLoop:
    @pytest.mark.asyncio
    async def test_simple_response_no_tools(self):
        """LLM returns text only, no tool calls."""
        mock_tools = MagicMock()
        mock_tools.openai_tools = []
        mock_tools.fn_name_to_tool_info = {}

        ctx = ToolLoopContext(
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            execution_id="test",
            tools=mock_tools,
        )

        mock_gateway = MagicMock()

        async def fake_stream(**kwargs):
            yield {"type": "token", "content": "Hello"}
            yield {"type": "token", "content": " world"}
            yield {"type": "done", "finish_reason": "stop"}

        mock_gateway.stream_with_tools = fake_stream

        messages = [{"role": "user", "content": "hi"}]
        result = await execute_tool_loop(
            ctx,
            messages,
            None,
            llm_kwargs={"provider_name": "test", "api_key": "k", "model": "m", "base_url": None},
            llm_gateway=mock_gateway,
            tool_dispatcher=MagicMock(),
        )

        assert result.full_response == "Hello world"
        assert result.was_cancelled is False
        assert result.tool_calls == []

    @pytest.mark.asyncio
    async def test_cancellation(self):
        """Pre-cancelled context should return immediately."""
        cancel_event = asyncio.Event()
        cancel_event.set()

        ctx = ToolLoopContext(
            workspace_id=uuid.uuid4(),
            conversation_id=None,
            execution_id="test",
            cancel_event=cancel_event,
        )

        mock_gateway = MagicMock()

        async def fake_stream(**kwargs):
            yield {"type": "token", "content": "should not appear"}
            yield {"type": "done", "finish_reason": "stop"}

        mock_gateway.stream_with_tools = fake_stream

        result = await execute_tool_loop(
            ctx,
            [],
            None,
            llm_kwargs={"provider_name": "test", "api_key": "k", "model": "m", "base_url": None},
            llm_gateway=mock_gateway,
            tool_dispatcher=MagicMock(),
        )

        assert result.was_cancelled is True

    @pytest.mark.asyncio
    async def test_thinking_tracked(self):
        """Thinking content should be captured."""
        mock_tools = MagicMock()
        mock_tools.openai_tools = []
        mock_tools.fn_name_to_tool_info = {}

        ctx = ToolLoopContext(
            workspace_id=uuid.uuid4(),
            conversation_id=None,
            execution_id="test",
            tools=mock_tools,
        )

        mock_gateway = MagicMock()

        async def fake_stream(**kwargs):
            yield {"type": "thinking", "content": "Let me think..."}
            yield {"type": "token", "content": "Answer"}
            yield {"type": "done", "finish_reason": "stop"}

        mock_gateway.stream_with_tools = fake_stream

        result = await execute_tool_loop(
            ctx,
            [],
            None,
            llm_kwargs={"provider_name": "test", "api_key": "k", "model": "m", "base_url": None},
            llm_gateway=mock_gateway,
            tool_dispatcher=MagicMock(),
        )

        assert result.full_thinking == "Let me think..."
        assert result.full_response == "Answer"
        assert any(e["type"] == "thinking" for e in result.timeline)
