"""Tests for strategy interface types and protocol."""

import asyncio
import uuid

import pytest

from openforge.runtime.strategies.interface import (
    AgentStrategy,
    BaseStrategy,
    RunContext,
    StepResult,
)


class TestStepResult:
    def test_defaults(self):
        result = StepResult()
        assert result.output == ""
        assert result.tool_calls == []
        assert result.artifacts == []
        assert result.metadata == {}
        assert result.should_continue is False

    def test_custom_values(self):
        result = StepResult(
            output="hello",
            tool_calls=[{"name": "test"}],
            artifacts=[{"type": "doc"}],
            metadata={"key": "val"},
            should_continue=True,
        )
        assert result.output == "hello"
        assert len(result.tool_calls) == 1
        assert result.should_continue is True


class TestRunContext:
    def test_construction(self):
        from unittest.mock import MagicMock

        spec = MagicMock()
        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=spec,
            db=MagicMock(),
            workspace_id=uuid.uuid4(),
            input_payload={"message": "test"},
        )
        assert ctx.state == {}
        assert ctx.step_results == []
        assert ctx.messages == []
        assert not ctx.cancel_event.is_set()


class TestBaseStrategy:
    @pytest.mark.asyncio
    async def test_default_plan(self):
        class TestStrategy(BaseStrategy):
            @property
            def name(self):
                return "test"

            async def execute_step(self, ctx, step):
                return StepResult(output="done")

        strategy = TestStrategy()
        from unittest.mock import MagicMock

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
        )
        plan = await strategy.plan(ctx)
        assert "steps" in plan
        assert len(plan["steps"]) == 1

    @pytest.mark.asyncio
    async def test_default_should_continue(self):
        class TestStrategy(BaseStrategy):
            @property
            def name(self):
                return "test"

            async def execute_step(self, ctx, step):
                return StepResult()

        strategy = TestStrategy()
        from unittest.mock import MagicMock

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
        )

        assert strategy.should_continue(ctx, StepResult(should_continue=True)) is True
        assert strategy.should_continue(ctx, StepResult(should_continue=False)) is False

    @pytest.mark.asyncio
    async def test_default_aggregate(self):
        class TestStrategy(BaseStrategy):
            @property
            def name(self):
                return "test"

            async def execute_step(self, ctx, step):
                return StepResult(output="final")

        strategy = TestStrategy()
        from unittest.mock import MagicMock

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
        )
        ctx.step_results = [StepResult(output="result1"), StepResult(output="result2")]
        result = await strategy.aggregate(ctx)
        assert result["output"] == "result2"

    @pytest.mark.asyncio
    async def test_aggregate_empty(self):
        class TestStrategy(BaseStrategy):
            @property
            def name(self):
                return "test"

            async def execute_step(self, ctx, step):
                return StepResult()

        strategy = TestStrategy()
        from unittest.mock import MagicMock

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=MagicMock(),
            workspace_id=None,
            input_payload={},
        )
        result = await strategy.aggregate(ctx)
        assert result["output"] == ""


class TestProtocolCompliance:
    def test_base_strategy_satisfies_protocol(self):
        class Concrete(BaseStrategy):
            @property
            def name(self):
                return "concrete"

            async def execute_step(self, ctx, step):
                return StepResult()

        assert isinstance(Concrete(), AgentStrategy)
