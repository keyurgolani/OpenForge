"""Tests for ChatStrategy."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.strategies.chat import ChatStrategy
from openforge.runtime.strategies.interface import RunContext, StepResult


class TestChatStrategy:
    def test_name(self):
        strategy = ChatStrategy()
        assert strategy.name == "chat"

    @pytest.mark.asyncio
    async def test_plan(self):
        strategy = ChatStrategy()
        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
        )
        plan = await strategy.plan(ctx)
        assert plan == {"steps": [{"action": "chat_loop"}]}

    @pytest.mark.asyncio
    async def test_execute_step_no_gateway(self):
        strategy = ChatStrategy()
        spec = MagicMock()
        spec.tools_enabled = False
        spec.system_prompt = "test"

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=spec,
            db=MagicMock(),
            workspace_id=uuid.uuid4(),
            input_payload={},
            llm_gateway=None,
        )
        result = await strategy.execute_step(ctx, {"action": "chat_loop"})
        assert result.output == "No LLM gateway configured."
        assert result.should_continue is False

    @pytest.mark.asyncio
    async def test_execute_step_max_iterations(self):
        strategy = ChatStrategy()
        spec = MagicMock()
        spec.tools_enabled = False
        spec.system_prompt = "test"

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=spec,
            db=MagicMock(),
            workspace_id=uuid.uuid4(),
            input_payload={},
            state={"max_iterations": 5, "iteration": 5},
        )
        result = await strategy.execute_step(ctx, {"action": "chat_loop"})
        assert result.output == "Maximum iterations reached."
        assert result.should_continue is False

    def test_should_continue_respects_max(self):
        strategy = ChatStrategy()
        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
            state={"max_iterations": 3, "iteration": 3},
        )
        result = StepResult(should_continue=True)
        assert strategy.should_continue(ctx, result) is False

    def test_should_continue_allows_more(self):
        strategy = ChatStrategy()
        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
            state={"max_iterations": 10, "iteration": 2},
        )
        result = StepResult(should_continue=True)
        assert strategy.should_continue(ctx, result) is True

    @pytest.mark.asyncio
    async def test_execute_step_with_llm_no_tools(self):
        """Test LLM call without tool calls returns response."""
        strategy = ChatStrategy()
        spec = MagicMock()
        spec.tools_enabled = False
        spec.system_prompt = "You are helpful."
        spec.provider_name = None
        spec.model_name = None

        mock_gateway = MagicMock()

        async def fake_stream(**kwargs):
            yield {"type": "token", "content": "Hello "}
            yield {"type": "token", "content": "world!"}
            yield {"type": "done", "finish_reason": "stop"}

        mock_gateway.stream_with_tools = fake_stream

        mock_llm_service = MagicMock()
        mock_llm_service.get_provider_for_workspace = AsyncMock(
            return_value=("test_provider", "key", "model", None)
        )

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=spec,
            db=MagicMock(),
            workspace_id=uuid.uuid4(),
            input_payload={},
            llm_gateway=mock_gateway,
            messages=[{"role": "user", "content": "hi"}],
        )

        with patch("openforge.services.llm_service.llm_service", mock_llm_service):
            result = await strategy.execute_step(ctx, {"action": "chat_loop"})

        assert result.output == "Hello world!"
        assert result.should_continue is False
        assert result.tool_calls == []
