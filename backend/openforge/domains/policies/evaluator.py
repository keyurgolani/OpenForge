"""Central policy evaluator."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .types import PolicyDecision, PolicyEvaluationResult, PolicyScopeType, ToolRiskCategory


SCOPE_PRECEDENCE: dict[str, int] = {
    PolicyScopeType.SYSTEM.value: 0,
    PolicyScopeType.WORKSPACE.value: 1,
    PolicyScopeType.PROFILE.value: 2,
    PolicyScopeType.WORKFLOW.value: 3,
    PolicyScopeType.MISSION.value: 4,
}


DEFAULT_RISK_DECISIONS: dict[ToolRiskCategory, PolicyDecision] = {
    ToolRiskCategory.READ_ONLY: PolicyDecision.ALLOW,
    ToolRiskCategory.RETRIEVAL_SEARCH: PolicyDecision.ALLOW,
    ToolRiskCategory.LOCAL_MUTATION: PolicyDecision.ALLOW,
    ToolRiskCategory.EXTERNAL_MUTATION: PolicyDecision.REQUIRES_APPROVAL,
    ToolRiskCategory.SENSITIVE_DATA_ACCESS: PolicyDecision.DENY,
    ToolRiskCategory.NETWORK_EXFILTRATION_RISK: PolicyDecision.REQUIRES_APPROVAL,
    ToolRiskCategory.DESTRUCTIVE: PolicyDecision.REQUIRES_APPROVAL,
}


class PolicyEvaluator:
    def __init__(self):
        self._run_tool_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def record_tool_invocation(self, run_id: str, tool_name: str) -> None:
        self._run_tool_counts[str(run_id)][tool_name] += 1

    def evaluate_tool_access(
        self,
        *,
        tool_name: str,
        risk_category: ToolRiskCategory,
        policies: list[dict[str, Any]],
        scope_context: dict[str, str | None],
        run_id: str | None,
    ) -> PolicyEvaluationResult:
        applicable = self._sorted_applicable_policies(policies, scope_context)
        for policy in applicable:
            rate_limit_result = self._evaluate_rate_limit(policy, tool_name, run_id, risk_category)
            if rate_limit_result is not None:
                return rate_limit_result

            if tool_name in policy.get("blocked_tools", []):
                return self._result(
                    PolicyDecision.DENY,
                    policy,
                    risk_category,
                    reason_code="tool_blocked",
                    reason_text=f"{tool_name} is blocked by the matched policy.",
                )

            if tool_name in policy.get("approval_required_tools", []):
                return self._result(
                    PolicyDecision.REQUIRES_APPROVAL,
                    policy,
                    risk_category,
                    reason_code="tool_requires_approval",
                    reason_text=f"{tool_name} requires approval under the matched policy.",
                )

            if tool_name in policy.get("allowed_tools", []):
                return self._result(
                    PolicyDecision.ALLOW,
                    policy,
                    risk_category,
                    reason_code="tool_allowed",
                    reason_text=f"{tool_name} is explicitly allowed by the matched policy.",
                )

            for rule in policy.get("rules", []):
                if rule.get("tool_name") not in (None, tool_name, "*"):
                    continue
                if rule.get("risk_category") not in (None, risk_category.value):
                    continue
                action = rule.get("action") or policy.get("default_action", "allow")
                decision = PolicyDecision(action)
                return self._result(
                    decision,
                    policy,
                    risk_category,
                    reason_code="rule_match",
                    reason_text=rule.get("reason_text") or f"{tool_name} matched a policy rule.",
                    matched_rule_id=rule.get("id"),
                )

            default_action = policy.get("default_action", "allow")
            if default_action != "allow":
                return self._result(
                    PolicyDecision(default_action),
                    policy,
                    risk_category,
                    reason_code="policy_default",
                    reason_text=f"{tool_name} inherits the matched policy default action.",
                )

        default_decision = DEFAULT_RISK_DECISIONS.get(risk_category, PolicyDecision.ALLOW)
        reason_code = {
            PolicyDecision.ALLOW: "risk_default_allow",
            PolicyDecision.DENY: "risk_default_deny",
            PolicyDecision.REQUIRES_APPROVAL: "risk_default_requires_approval",
        }[default_decision]
        reason_text = {
            PolicyDecision.ALLOW: "The tool is allowed by the default risk policy.",
            PolicyDecision.DENY: "The tool is blocked by the default risk policy.",
            PolicyDecision.REQUIRES_APPROVAL: "The tool requires approval by the default risk policy.",
        }[default_decision]
        return PolicyEvaluationResult(
            decision=default_decision,
            reason_code=reason_code,
            reason_text=reason_text,
            risk_category=risk_category,
            rate_limit_state={},
        )

    def _evaluate_rate_limit(
        self,
        policy: dict[str, Any],
        tool_name: str,
        run_id: str | None,
        risk_category: ToolRiskCategory,
    ) -> PolicyEvaluationResult | None:
        limits = policy.get("rate_limits", {}) or {}
        tool_limits = limits.get(tool_name) or limits.get("*")
        if not tool_limits:
            return None

        per_run_limit = tool_limits.get("per_run")
        if per_run_limit is None or run_id is None:
            return None

        used = self._run_tool_counts[str(run_id)].get(tool_name, 0)
        remaining = max(int(per_run_limit) - int(used), 0)
        if used >= int(per_run_limit):
            return PolicyEvaluationResult(
                decision=PolicyDecision.DENY,
                matched_policy_id=str(policy.get("id")),
                matched_policy_scope=PolicyScopeType(str(policy.get("scope_type", PolicyScopeType.SYSTEM.value))),
                reason_code="rate_limit_exceeded",
                reason_text=f"{tool_name} exceeded the configured per-run limit.",
                risk_category=risk_category,
                rate_limit_state={
                    "per_run_limit": int(per_run_limit),
                    "per_run_used": int(used),
                    "per_run_remaining": remaining,
                },
            )
        return None

    def _sorted_applicable_policies(self, policies: list[dict[str, Any]], scope_context: dict[str, str | None]) -> list[dict[str, Any]]:
        def _matches(policy: dict[str, Any]) -> bool:
            if policy.get("status") not in {None, "active"}:
                return False
            scope_type = str(policy.get("scope_type", PolicyScopeType.SYSTEM.value))
            scope_id = policy.get("scope_id")
            if scope_type == PolicyScopeType.SYSTEM.value:
                return True
            context_key = f"{scope_type}_id"
            if context_key not in scope_context:
                return False
            return str(scope_context.get(context_key)) == str(scope_id)

        return sorted(
            [policy for policy in policies if _matches(policy)],
            key=lambda policy: SCOPE_PRECEDENCE.get(str(policy.get("scope_type")), -1),
            reverse=True,
        )

    def _result(
        self,
        decision: PolicyDecision,
        policy: dict[str, Any],
        risk_category: ToolRiskCategory,
        *,
        reason_code: str,
        reason_text: str,
        matched_rule_id: str | None = None,
    ) -> PolicyEvaluationResult:
        return PolicyEvaluationResult(
            decision=decision,
            matched_policy_id=str(policy.get("id")),
            matched_rule_id=matched_rule_id,
            matched_policy_scope=PolicyScopeType(str(policy.get("scope_type", PolicyScopeType.SYSTEM.value))),
            reason_code=reason_code,
            reason_text=reason_text,
            risk_category=risk_category,
            rate_limit_state={},
        )


policy_evaluator = PolicyEvaluator()
