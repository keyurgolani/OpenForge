from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ToolPermission

logger = logging.getLogger("openforge.policy")


class PolicyEngine:
    """
    Evaluates whether a tool call should be auto-approved, require HITL, or be blocked.

    Checks explicit user overrides first (ToolPermission table),
    then falls back to risk-level defaults.
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

    async def evaluate_async(self, tool_id: str, risk_level: str, db: AsyncSession) -> str:
        """
        Async evaluation that checks ToolPermission overrides first.
        Returns 'approve', 'hitl_required', or 'blocked'.
        """
        try:
            result = await db.execute(
                select(ToolPermission).where(ToolPermission.tool_id == tool_id)
            )
            perm = result.scalar_one_or_none()

            if perm and perm.permission != "default":
                if perm.permission == "blocked":
                    return "blocked"
                elif perm.permission == "hitl":
                    return "hitl_required"
                elif perm.permission == "allowed":
                    return "approve"
        except Exception as e:
            logger.warning("Failed to check tool permission for %s: %s", tool_id, e)

        # Fall back to risk-level defaults
        if risk_level in self.REQUIRE_HITL:
            return "hitl_required"
        return "approve"


policy_engine = PolicyEngine()
