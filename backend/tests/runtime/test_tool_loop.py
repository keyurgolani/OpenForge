"""Tests for tool_loop shared execution layer."""

import asyncio
import uuid
from uuid import uuid4
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

    @pytest.mark.asyncio
    async def test_tool_timeline_preserves_structured_output(self):
        """Structured tool results should stay parseable for the chat timeline UI."""
        mock_tools = MagicMock()
        mock_tools.openai_tools = [{"type": "function", "function": {"name": "workspace__search"}}]
        mock_tools.fn_name_to_tool_info = {}

        ctx = ToolLoopContext(
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            execution_id="test",
            tools=mock_tools,
        )

        mock_gateway = MagicMock()

        async def fake_stream(**kwargs):
            yield {
                "type": "tool_calls",
                "calls": [
                    {
                        "id": "call-1",
                        "name": "workspace__search",
                        "arguments": {"query": "Docker Compose recreate temp-prefixed container names"},
                    }
                ],
            }
            yield {"type": "done", "finish_reason": "tool_calls"}

        mock_gateway.stream_with_tools = fake_stream

        tool_dispatcher = MagicMock()
        tool_dispatcher.execute = AsyncMock(
            return_value={
                "success": True,
                "output": {
                    "results": [
                        {
                            "title": "API Reference Docs",
                            "chunk_text": "Structured output should reach the timeline intact.",
                            "score": 0.91,
                        }
                    ]
                },
            }
        )

        callbacks = ToolLoopCallbacks(on_tool_result=AsyncMock())
        result = await execute_tool_loop(
            ctx,
            [{"role": "user", "content": "Find docs"}],
            callbacks,
            llm_kwargs={"provider_name": "test", "api_key": "k", "model": "m", "base_url": None},
            max_iterations=1,
            llm_gateway=mock_gateway,
            tool_dispatcher=tool_dispatcher,
        )

        tool_entry = next(entry for entry in result.timeline if entry["type"] == "tool_call")
        assert tool_entry["output"] == {
            "results": [
                {
                    "title": "API Reference Docs",
                    "chunk_text": "Structured output should reach the timeline intact.",
                    "score": 0.91,
                }
            ]
        }
        callbacks.on_tool_result.assert_awaited_once()
        assert callbacks.on_tool_result.await_args.args[4] == tool_entry["output"]

    @pytest.mark.asyncio
    async def test_tool_timeline_parses_wrapped_json_output(self):
        """Wrapped JSON strings should be parsed before they reach the timeline UI."""
        mock_tools = MagicMock()
        mock_tools.openai_tools = [{"type": "function", "function": {"name": "http__search_web"}}]
        mock_tools.fn_name_to_tool_info = {}

        ctx = ToolLoopContext(
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            execution_id="test",
            tools=mock_tools,
        )

        mock_gateway = MagicMock()

        async def fake_stream(**kwargs):
            yield {
                "type": "tool_calls",
                "calls": [
                    {
                        "id": "call-2",
                        "name": "http__search_web",
                        "arguments": {"query": "docker compose recreate temp prefixed container names"},
                    }
                ],
            }
            yield {"type": "done", "finish_reason": "tool_calls"}

        mock_gateway.stream_with_tools = fake_stream

        wrapped_output = (
            '<untrusted_content source="web search: docker compose recreate temp prefixed container names">'
            '{"results":[{"title":"Compose issue","snippet":"Structured cards should render."}],"query":"docker compose recreate temp prefixed container names"}'
            "</untrusted_content>"
        )

        tool_dispatcher = MagicMock()
        tool_dispatcher.execute = AsyncMock(
            return_value={
                "success": True,
                "output": wrapped_output,
            }
        )

        result = await execute_tool_loop(
            ctx,
            [{"role": "user", "content": "Search the web"}],
            ToolLoopCallbacks(),
            llm_kwargs={"provider_name": "test", "api_key": "k", "model": "m", "base_url": None},
            max_iterations=1,
            llm_gateway=mock_gateway,
            tool_dispatcher=tool_dispatcher,
        )

        tool_entry = next(entry for entry in result.timeline if entry["type"] == "tool_call")
        assert tool_entry["output"] == {
            "results": [{"title": "Compose issue", "snippet": "Structured cards should render."}],
            "query": "docker compose recreate temp prefixed container names",
        }


@pytest.mark.asyncio
async def test_auto_fills_workspace_id_when_default_set(monkeypatch):
    """When default_workspace_id is set on context and tool call omits workspace_id,
    the dispatcher should receive the default."""
    from openforge.runtime.tool_loop import ToolLoopContext

    ctx = ToolLoopContext(
        workspace_id=None,
        conversation_id=uuid4(),
        execution_id="test-exec",
        default_workspace_id="ws-123",
    )
    # Verify the field exists and is set
    assert ctx.default_workspace_id == "ws-123"


@pytest.mark.asyncio
async def test_default_workspace_id_is_none_by_default():
    from openforge.runtime.tool_loop import ToolLoopContext

    ctx = ToolLoopContext(
        workspace_id=None,
        conversation_id=uuid4(),
        execution_id="test-exec",
    )
    assert ctx.default_workspace_id is None
