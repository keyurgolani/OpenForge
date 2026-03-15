"""
Policy Engine

Transitional runtime wrapper over the Phase 3 policy evaluator.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ToolPolicyModel
from openforge.domains.policies.evaluator import PolicyEvaluator, policy_evaluator
from openforge.domains.policies.types import PolicyDecision, ToolRiskCategory

if TYPE_CHECKING:
    from openforge.runtime.profile_registry import ResolvedAgentProfile

logger = logging.getLogger("openforge.runtime.policy")


class PolicyEngine:
    """
    Transitional adapter that maps Phase 3 decisions to the runtime's
    `"approve"`, `"hitl_required"`, and `"blocked"` labels.
    """

    def evaluate(self, tool_id: str, risk_level: str) -> str:
        result = policy_evaluator.evaluate_tool_access(
            tool_name=tool_id,
            risk_category=_coerce_runtime_risk(risk_level),
            policies=[],
            scope_context={},
            run_id="runtime-sync",
        )
        return _decision_label(result.decision)

    async def evaluate_async(
        self,
        tool_id: str,
        risk_level: str,
        db: AsyncSession,
        agent: "ResolvedAgentProfile" | None = None,
    ) -> str:
        policies = [
            {
                "id": str(row.id),
                "scope_type": row.scope_type,
                "scope_id": row.scope_id,
                "default_action": row.default_action,
                "rules": row.rules or [],
                "rate_limits": row.rate_limits or {},
                "allowed_tools": row.allowed_tools or [],
                "blocked_tools": row.blocked_tools or [],
                "approval_required_tools": row.approval_required_tools or [],
                "status": row.status,
            }
            for row in (
                await db.execute(select(ToolPolicyModel).where(ToolPolicyModel.status == "active"))
            ).scalars().all()
        ]

        if agent and getattr(agent, "tool_overrides", None):
            policies.insert(
                0,
                {
                    "id": "profile-tool-override",
                    "scope_type": "profile",
                    "scope_id": getattr(agent, "id", None),
                    "default_action": "allow",
                    "rules": [],
                    "rate_limits": {},
                    "allowed_tools": [tool for tool, decision in agent.tool_overrides.items() if decision == "allowed"],
                    "blocked_tools": [tool for tool, decision in agent.tool_overrides.items() if decision == "blocked"],
                    "approval_required_tools": [tool for tool, decision in agent.tool_overrides.items() if decision == "hitl"],
                    "status": "active",
                },
            )

        result = policy_evaluator.evaluate_tool_access(
            tool_name=tool_id,
            risk_category=_coerce_runtime_risk(risk_level),
            policies=policies,
            scope_context={"profile_id": getattr(agent, "id", None)},
            run_id=getattr(agent, "id", None) or "runtime-async",
        )
        return _decision_label(result.decision)


# Singleton instance
policy_engine = PolicyEngine()


def _coerce_runtime_risk(value: str) -> ToolRiskCategory:
    normalized = (value or "").strip().lower()
    if normalized in {"critical", "destructive"}:
        return ToolRiskCategory.DESTRUCTIVE
    if normalized in {"high", "external_mutation"}:
        return ToolRiskCategory.EXTERNAL_MUTATION
    if normalized in {"medium", "local_mutation"}:
        return ToolRiskCategory.LOCAL_MUTATION
    return ToolRiskCategory.READ_ONLY


def _decision_label(decision: PolicyDecision) -> str:
    if decision is PolicyDecision.DENY:
        return "blocked"
    if decision is PolicyDecision.REQUIRES_APPROVAL:
        return "hitl_required"
    return "approve"


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
