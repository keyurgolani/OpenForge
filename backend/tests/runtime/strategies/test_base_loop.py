"""Tests for strategy base loop execution."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.strategies.base_loop import run_strategy_loop
from openforge.runtime.strategies.interface import BaseStrategy, RunContext, StepResult


class ThreeStepStrategy(BaseStrategy):
    """Test strategy that runs 3 planned steps."""

    @property
    def name(self):
        return "three_step"

    async def plan(self, ctx):
        return {
            "steps": [
                {"action": "step_1"},
                {"action": "step_2"},
                {"action": "step_3"},
            ]
        }

    async def execute_step(self, ctx, step):
        action = step.get("action", "unknown")
        return StepResult(output=f"completed {action}", should_continue=False)

    def should_continue(self, ctx, latest):
        # Plan-driven, never loop
        return False


class LoopingStrategy(BaseStrategy):
    """Test strategy that loops via should_continue."""

    @property
    def name(self):
        return "looping"

    async def execute_step(self, ctx, step):
        iteration = ctx.state.get("iteration", 0)
        ctx.state["iteration"] = iteration + 1
        return StepResult(
            output=f"iteration {iteration}",
            should_continue=iteration < 2,
        )


class TestRunStrategyLoop:
    @pytest.mark.asyncio
    async def test_three_step_execution(self):
        strategy = ThreeStepStrategy()
        mock_db = MagicMock()
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=mock_db,
            workspace_id=uuid.uuid4(),
            input_payload={},
        )

        result = await run_strategy_loop(strategy, ctx)
        assert len(ctx.step_results) == 3
        assert ctx.step_results[0].output == "completed step_1"
        assert ctx.step_results[2].output == "completed step_3"
        assert result["output"] == "completed step_3"

    @pytest.mark.asyncio
    async def test_cancellation_respected(self):
        strategy = ThreeStepStrategy()
        mock_db = MagicMock()
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        cancel_event = asyncio.Event()
        cancel_event.set()  # Pre-cancel

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=mock_db,
            workspace_id=uuid.uuid4(),
            input_payload={},
            cancel_event=cancel_event,
        )

        result = await run_strategy_loop(strategy, ctx)
        assert result.get("cancelled") is True
        assert len(ctx.step_results) == 0

    @pytest.mark.asyncio
    async def test_events_published(self):
        strategy = ThreeStepStrategy()
        mock_db = MagicMock()
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        mock_publisher = MagicMock()
        mock_publisher.publish = AsyncMock()

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=mock_db,
            workspace_id=uuid.uuid4(),
            input_payload={},
            event_publisher=mock_publisher,
        )

        await run_strategy_loop(strategy, ctx)

        # Should have published events for planning, 3 steps, and aggregation
        assert mock_publisher.publish.call_count > 0
        event_types = [call.args[0].event_type for call in mock_publisher.publish.call_args_list]
        assert "strategy_thought" in event_types
        assert "step_started" in event_types
        assert "step_completed" in event_types

    @pytest.mark.asyncio
    async def test_step_failure_raises(self):
        class FailingStrategy(BaseStrategy):
            @property
            def name(self):
                return "failing"

            async def execute_step(self, ctx, step):
                raise RuntimeError("step failed")

        strategy = FailingStrategy()
        mock_db = MagicMock()
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        ctx = RunContext(
            run_id=uuid.uuid4(),
            agent_spec=MagicMock(),
            db=mock_db,
            workspace_id=uuid.uuid4(),
            input_payload={},
        )

        with pytest.raises(RuntimeError, match="step failed"):
            await run_strategy_loop(strategy, ctx)
