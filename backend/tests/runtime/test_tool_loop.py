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
async def test_deployment_workspace_id_can_be_set(monkeypatch):
    """ToolLoopContext supports deployment_workspace_id for deployment-owned workspace enforcement."""
    from openforge.runtime.tool_loop import ToolLoopContext

    ctx = ToolLoopContext(
        conversation_id=uuid4(),
        execution_id="test-exec",
        deployment_workspace_id="ws-123",
    )
    assert ctx.deployment_workspace_id == "ws-123"


@pytest.mark.asyncio
async def test_deployment_workspace_id_is_none_by_default():
    from openforge.runtime.tool_loop import ToolLoopContext

    ctx = ToolLoopContext(
        conversation_id=uuid4(),
        execution_id="test-exec",
    )
    assert ctx.deployment_workspace_id is None


class TestConsecutiveFailureCap:
    """Tests for the consecutive tool failure cap feature."""

    def _make_ctx(self):
        mock_tools = MagicMock()
        mock_tools.openai_tools = [{"type": "function", "function": {"name": "my_tool"}}]
        mock_tools.fn_name_to_tool_info = {
            "my_tool": {"type": "builtin", "tool_id": "my.tool"},
        }
        return ToolLoopContext(
            conversation_id=uuid.uuid4(),
            execution_id="test",
            tools=mock_tools,
        )

    def _make_gateway(self, num_tool_iterations: int):
        """Create a gateway that yields tool calls for num_tool_iterations, then stops."""
        call_count = 0

        async def fake_stream(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= num_tool_iterations:
                yield {
                    "type": "tool_calls",
                    "calls": [{"id": f"call-{call_count}", "name": "my_tool", "arguments": {"attempt": call_count}}],
                }
                yield {"type": "done", "finish_reason": "tool_calls"}
            else:
                yield {"type": "token", "content": "done"}
                yield {"type": "done", "finish_reason": "stop"}

        gw = MagicMock()
        gw.stream_with_tools = fake_stream
        return gw

    @pytest.mark.asyncio
    async def test_failure_tracking_blocks_after_threshold(self):
        """After max_consecutive_failures consecutive failures, the tool is blocked."""
        ctx = self._make_ctx()
        gateway = self._make_gateway(num_tool_iterations=4)

        dispatcher = MagicMock()
        dispatcher.execute = AsyncMock(
            return_value={"success": False, "error": "boom"}
        )

        messages = [{"role": "user", "content": "go"}]
        result = await execute_tool_loop(
            ctx,
            messages,
            None,
            llm_kwargs={"provider_name": "t", "api_key": "k", "model": "m", "base_url": None},
            max_consecutive_failures=3,
            llm_gateway=gateway,
            tool_dispatcher=dispatcher,
        )

        # First 3 calls go through the dispatcher; 4th is blocked (short-circuited)
        assert dispatcher.execute.await_count == 3

        # The 4th tool_call timeline entry should have the blocked message
        tool_entries = [e for e in result.timeline if e["type"] == "tool_call"]
        assert len(tool_entries) == 4
        assert tool_entries[3]["success"] is False
        assert "blocked" in tool_entries[3]["error"]

    @pytest.mark.asyncio
    async def test_counter_reset_on_success(self):
        """A successful execution resets the failure counter, preventing blocking."""
        ctx = self._make_ctx()
        # 5 iterations: fail, fail, success, fail, fail — never reaches 3 consecutive
        gateway = self._make_gateway(num_tool_iterations=5)

        dispatcher = MagicMock()
        dispatcher.execute = AsyncMock(
            side_effect=[
                {"success": False, "error": "err"},
                {"success": False, "error": "err"},
                {"success": True, "output": "ok"},   # resets counter
                {"success": False, "error": "err"},
                {"success": False, "error": "err"},
            ]
        )

        messages = [{"role": "user", "content": "go"}]
        result = await execute_tool_loop(
            ctx,
            messages,
            None,
            llm_kwargs={"provider_name": "t", "api_key": "k", "model": "m", "base_url": None},
            max_consecutive_failures=3,
            llm_gateway=gateway,
            tool_dispatcher=dispatcher,
        )

        # All 5 calls should go through the dispatcher (none blocked)
        assert dispatcher.execute.await_count == 5

        # No system message about blocking should be in messages
        system_msgs = [m for m in messages if m.get("role") == "system" and "blocked" in m.get("content", "").lower()]
        assert len(system_msgs) == 0

    @pytest.mark.asyncio
    async def test_system_message_injected_at_threshold(self):
        """When the failure threshold is reached, a system message is appended to messages."""
        ctx = self._make_ctx()
        gateway = self._make_gateway(num_tool_iterations=3)

        dispatcher = MagicMock()
        dispatcher.execute = AsyncMock(
            return_value={"success": False, "error": "boom"}
        )

        messages = [{"role": "user", "content": "go"}]
        result = await execute_tool_loop(
            ctx,
            messages,
            None,
            llm_kwargs={"provider_name": "t", "api_key": "k", "model": "m", "base_url": None},
            max_consecutive_failures=3,
            llm_gateway=gateway,
            tool_dispatcher=dispatcher,
        )

        system_msgs = [
            m for m in messages
            if m.get("role") == "system" and "my.tool" in m.get("content", "")
        ]
        assert len(system_msgs) == 1
        assert "failed 3 consecutive times" in system_msgs[0]["content"]
        assert "Do not retry it" in system_msgs[0]["content"]

    @pytest.mark.asyncio
    async def test_blocked_tool_short_circuits_dispatcher(self):
        """Once blocked, subsequent calls skip the dispatcher entirely."""
        ctx = self._make_ctx()
        # 5 iterations: 3 failures to trigger block, then 2 more attempts
        gateway = self._make_gateway(num_tool_iterations=5)

        dispatcher = MagicMock()
        dispatcher.execute = AsyncMock(
            return_value={"success": False, "error": "boom"}
        )

        messages = [{"role": "user", "content": "go"}]
        result = await execute_tool_loop(
            ctx,
            messages,
            None,
            llm_kwargs={"provider_name": "t", "api_key": "k", "model": "m", "base_url": None},
            max_consecutive_failures=3,
            llm_gateway=gateway,
            tool_dispatcher=dispatcher,
        )

        # Only 3 calls to dispatcher; iterations 4 and 5 are short-circuited
        assert dispatcher.execute.await_count == 3

        tool_entries = [e for e in result.timeline if e["type"] == "tool_call"]
        # Iterations 4 and 5 should both be blocked
        for entry in tool_entries[3:]:
            assert entry["success"] is False
            assert "blocked" in entry["error"]
