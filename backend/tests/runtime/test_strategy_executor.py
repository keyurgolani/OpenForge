"""Tests for StrategyExecutor."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.strategy_executor import StrategyExecutor
from openforge.runtime.strategies.interface import BaseStrategy, StepResult


class SimpleStrategy(BaseStrategy):
    @property
    def name(self):
        return "simple"

    async def execute_step(self, ctx, step):
        return StepResult(output="strategy output", should_continue=False)


class TestStrategyExecutor:
    @pytest.mark.asyncio
    async def test_execute_creates_run_and_completes(self):
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        mock_publisher = MagicMock()
        mock_publisher.publish = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.strategy = "simple"

        # Register the test strategy
        with patch("openforge.runtime.strategy_executor.strategy_registry") as mock_registry:
            mock_registry.get.return_value = SimpleStrategy()

            executor = StrategyExecutor(
                db=mock_db,
                event_publisher=mock_publisher,
            )
            result = await executor.execute(
                spec,
                {"message": "hello"},
                workspace_id=uuid.uuid4(),
            )

        assert result["output"] == "strategy output"
        assert mock_publisher.publish.call_count >= 2  # RUN_STARTED + RUN_COMPLETED

    @pytest.mark.asyncio
    async def test_execute_fallback_to_chat(self):
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.strategy = "nonexistent"

        with patch("openforge.runtime.strategy_executor.strategy_registry") as mock_registry:
            # First call for "nonexistent" returns None, second for "chat" returns our strategy
            mock_registry.get.side_effect = [None, SimpleStrategy()]

            executor = StrategyExecutor(db=mock_db)
            result = await executor.execute(
                spec,
                {"message": "hello"},
                workspace_id=uuid.uuid4(),
            )

        assert result["output"] == "strategy output"

    @pytest.mark.asyncio
    async def test_execute_failure_transitions_run(self):
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        mock_publisher = MagicMock()
        mock_publisher.publish = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.strategy = "failing"

        class FailingStrategy(BaseStrategy):
            @property
            def name(self):
                return "failing"

            async def execute_step(self, ctx, step):
                raise RuntimeError("boom")

        with patch("openforge.runtime.strategy_executor.strategy_registry") as mock_registry:
            mock_registry.get.return_value = FailingStrategy()

            executor = StrategyExecutor(
                db=mock_db,
                event_publisher=mock_publisher,
            )

            with pytest.raises(RuntimeError, match="boom"):
                await executor.execute(
                    spec,
                    {"message": "hello"},
                    workspace_id=uuid.uuid4(),
                )

        # Should have published RUN_STARTED and RUN_FAILED
        event_types = [call.args[0].event_type for call in mock_publisher.publish.call_args_list]
        assert "run_started" in event_types
        assert "run_failed" in event_types
