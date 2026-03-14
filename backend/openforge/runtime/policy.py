"""
Policy Engine

Evaluates whether a tool call should be auto-approved, require HITL, or be blocked.
Evaluation chain: agent override → global ToolPermission table → risk-level defaults.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ToolPermission

if TYPE_CHECKING:
    from openforge.legacy.agent_definition import AgentDefinition

logger = logging.getLogger("openforge.runtime.policy")


class PolicyEngine:
    """
    Evaluates whether a tool call should be auto-approved, require HITL, or be blocked.

    Evaluation chain: agent override → global ToolPermission table → risk-level defaults.
    """

    REQUIRE_HITL = {"high", "critical"}

    def evaluate(self, tool_id: str, risk_level: str) -> str:
        """
        Synchronous evaluation using only risk level (backward compat).
        Returns 'approve' or 'hitl_required'.
        """
        if risk_level in self.REQUIRE_HITL:
            return "hitl_required"
        return "approve"

    async def evaluate_async(
        self,
        tool_id: str,
        risk_level: str,
        db: AsyncSession,
        agent: AgentDefinition | None = None,
    ) -> str:
        """
        Async evaluation that checks agent overrides, then ToolPermission overrides,
        then falls back to risk-level defaults.
        Returns 'approve', 'hitl_required', or 'blocked'.
        """
        # 1. Check agent-specific override
        if agent and agent.tool_overrides:
            if tool_id in agent.tool_overrides:
                perm = agent.tool_overrides[tool_id]
                if perm == "blocked":
                    return "blocked"
                if perm == "hitl":
                    return "hitl_required"
                if perm == "allowed":
                    return "approve"

        # 2. Check global tool_permissions table
        try:
            result = await db.execute(
                select(ToolPermission).where(ToolPermission.tool_id == tool_id)
            )
            perm_row = result.scalar_one_or_none()

            if perm_row and perm_row.permission != "default":
                if perm_row.permission == "blocked":
                    return "blocked"
                elif perm_row.permission == "hitl":
                    return "hitl_required"
                elif perm_row.permission == "allowed":
                    return "approve"
        except Exception as e:
            logger.warning("Failed to check tool permission for %s: %s", tool_id, e)

        # 3. Fall back to risk-level defaults
        if risk_level in self.REQUIRE_HITL:
            return "hitl_required"
        return "approve"


# Singleton instance
policy_engine = PolicyEngine()


class ToolCallRateLimiter:
    """Rate-limits tool calls per execution.

    Tracks per-minute and per-execution totals. Thread-safe for single-process
    async usage (each execution has its own limiter instance).
    """

    def __init__(self, max_per_minute: int = 30, max_per_execution: int = 200) -> None:
        self.max_per_minute = max_per_minute
        self.max_per_execution = max_per_execution
        self._total_calls = 0
        self._minute_calls: list[float] = []  # timestamps of calls in the current window

    def check(self) -> str | None:
        """Check if the next call is allowed.

        Returns None if allowed, or an error message string if rate-limited.
        """
        # Per-execution limit
        if self._total_calls >= self.max_per_execution:
            return (
                f"Rate limit: maximum {self.max_per_execution} tool calls per execution reached. "
                f"Wrap up your current task."
            )

        # Per-minute sliding window
        now = time.monotonic()
        cutoff = now - 60.0
        self._minute_calls = [t for t in self._minute_calls if t > cutoff]
        if len(self._minute_calls) >= self.max_per_minute:
            return (
                f"Rate limit: maximum {self.max_per_minute} tool calls per minute reached. "
                f"Please wait before making more tool calls."
            )

        return None

    def record(self) -> None:
        """Record a tool call."""
        self._total_calls += 1
        self._minute_calls.append(time.monotonic())
