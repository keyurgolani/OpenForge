"""Coordinator strategy — stub that delegates to ChatStrategy.

Named coordinator_strategy.py to avoid collision with runtime/coordinator.py.
"""

from __future__ import annotations

import logging
from typing import Any

from .chat import ChatStrategy
from .interface import RunContext, StepResult

logger = logging.getLogger("openforge.runtime.strategies.coordinator_strategy")


class CoordinatorStrategy(ChatStrategy):
    """Coordinator-oriented strategy. Currently delegates to ChatStrategy."""

    @property
    def name(self) -> str:
        return "coordinator"

    async def execute_step(self, ctx: RunContext, step: dict[str, Any]) -> StepResult:
        logger.info("CoordinatorStrategy delegating to ChatStrategy for run %s", ctx.run_id)
        return await super().execute_step(ctx, step)
