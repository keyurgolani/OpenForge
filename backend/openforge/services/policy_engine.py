from __future__ import annotations


class PolicyEngine:
    """
    Evaluates whether a tool call should be auto-approved or require HITL.
    Decision is based on the tool's risk_level from the tool registry.
    """

    REQUIRE_HITL = {"high", "critical"}

    def evaluate(self, tool_id: str, risk_level: str) -> str:
        """
        Returns 'approve' or 'hitl_required'.

        - low / medium  → approve (auto-execute)
        - high / critical → hitl_required (pause and ask the user)
        """
        if risk_level in self.REQUIRE_HITL:
            return "hitl_required"
        return "approve"


policy_engine = PolicyEngine()
