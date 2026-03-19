"""Reviewer strategy — stub that delegates to ChatStrategy."""

from __future__ import annotations

import logging
from typing import Any

from .chat import ChatStrategy
from .interface import RunContext, StepResult

logger = logging.getLogger("openforge.runtime.strategies.reviewer")


class ReviewerStrategy(ChatStrategy):
    """Review-oriented strategy. Currently delegates to ChatStrategy."""

    @property
    def name(self) -> str:
        return "reviewer"

    async def execute_step(self, ctx: RunContext, step: dict[str, Any]) -> StepResult:
        logger.info("ReviewerStrategy delegating to ChatStrategy for run %s", ctx.run_id)
        return await super().execute_step(ctx, step)
