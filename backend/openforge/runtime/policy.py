"""
Policy Engine

Runtime policy evaluation for tool access decisions.
Types and evaluator inlined from the deleted domains/policies/ package.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from enum import StrEnum
from typing import Any, TYPE_CHECKING

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from openforge.domains.agents.compiled_spec import AgentRuntimeConfig

logger = logging.getLogger("openforge.runtime.policy")


# ── Policy types (relocated from domains/policies/types.py) ──


class PolicyScopeType(StrEnum):
    SYSTEM = "system"
    WORKSPACE = "workspace"


class PolicyDecision(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRES_APPROVAL = "requires_approval"


class ToolRiskCategory(StrEnum):
    READ_ONLY = "harmless_read_only"
    RETRIEVAL_SEARCH = "retrieval_search"
    LOCAL_MUTATION = "local_mutation"
    EXTERNAL_MUTATION = "external_mutation"
    SENSITIVE_DATA_ACCESS = "sensitive_data_access"
    NETWORK_EXFILTRATION_RISK = "network_exfiltration_risk"
    DESTRUCTIVE = "destructive"


class PolicyEvaluationResult(BaseModel):
    decision: PolicyDecision
    matched_policy_id: str | None = None
    matched_rule_id: str | None = None
    matched_policy_scope: PolicyScopeType | None = None
    reason_code: str
    reason_text: str
    risk_category: ToolRiskCategory
    rate_limit_state: dict[str, Any] | None = None


# ── Policy evaluator (relocated from domains/policies/evaluator.py) ──


SCOPE_PRECEDENCE: dict[str, int] = {
    PolicyScopeType.SYSTEM.value: 0,
    PolicyScopeType.WORKSPACE.value: 1,
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
                    PolicyDecision.DENY, policy, risk_category,
                    reason_code="tool_blocked",
                    reason_text=f"{tool_name} is blocked by the matched policy.",
                )

            if tool_name in policy.get("approval_required_tools", []):
                return self._result(
                    PolicyDecision.REQUIRES_APPROVAL, policy, risk_category,
                    reason_code="tool_requires_approval",
                    reason_text=f"{tool_name} requires approval under the matched policy.",
                )

            if tool_name in policy.get("allowed_tools", []):
                return self._result(
                    PolicyDecision.ALLOW, policy, risk_category,
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
                    decision, policy, risk_category,
                    reason_code="rule_match",
                    reason_text=rule.get("reason_text") or f"{tool_name} matched a policy rule.",
                    matched_rule_id=rule.get("id"),
                )

            default_action = policy.get("default_action", "allow")
            if default_action != "allow":
                return self._result(
                    PolicyDecision(default_action), policy, risk_category,
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
        self, policy: dict[str, Any], tool_name: str, run_id: str | None, risk_category: ToolRiskCategory,
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
        self, decision: PolicyDecision, policy: dict[str, Any], risk_category: ToolRiskCategory,
        *, reason_code: str, reason_text: str, matched_rule_id: str | None = None,
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


# ── PolicyEngine (runtime wrapper) ──


class PolicyEngine:
    """Runtime adapter that maps policy decisions to approve/hitl_required/blocked."""

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
        agent: Any = None,
        agent_spec: "AgentRuntimeConfig | None" = None,
    ) -> str:
        # Tool policy table queries removed (domain deleted).
        # Agent-level overrides via AgentRuntimeConfig are the sole policy source.
        policies: list[dict[str, Any]] = []

        _agent_id: str | None = None
        if agent_spec is not None:
            _agent_id = str(agent_spec.agent_id)
            _approval_tools = list(agent_spec.confirm_before_tools) if agent_spec.confirm_before_tools else []
            _blocked_tools: list[str] = []
            if _approval_tools or _blocked_tools:
                policies.insert(0, {
                    "id": "agent-spec-override",
                    "scope_type": "profile",
                    "scope_id": _agent_id,
                    "default_action": "allow",
                    "rules": [],
                    "rate_limits": {},
                    "allowed_tools": [],
                    "blocked_tools": _blocked_tools,
                    "approval_required_tools": _approval_tools,
                    "status": "active",
                })
        elif agent and getattr(agent, "tool_overrides", None):
            _agent_id = getattr(agent, "id", None)
            policies.insert(0, {
                "id": "profile-tool-override",
                "scope_type": "profile",
                "scope_id": _agent_id,
                "default_action": "allow",
                "rules": [],
                "rate_limits": {},
                "allowed_tools": [tool for tool, decision in agent.tool_overrides.items() if decision == "allowed"],
                "blocked_tools": [tool for tool, decision in agent.tool_overrides.items() if decision == "blocked"],
                "approval_required_tools": [tool for tool, decision in agent.tool_overrides.items() if decision == "hitl"],
                "status": "active",
            })

        result = policy_evaluator.evaluate_tool_access(
            tool_name=tool_id,
            risk_category=_coerce_runtime_risk(risk_level),
            policies=policies,
            scope_context={"profile_id": _agent_id},
            run_id=_agent_id or "runtime-async",
        )
        return _decision_label(result.decision)


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
    """Rate-limits tool calls per execution."""

    def __init__(self, max_per_minute: int = 30, max_per_execution: int = 200) -> None:
        self.max_per_minute = max_per_minute
        self.max_per_execution = max_per_execution
        self._total_calls = 0
        self._minute_calls: list[float] = []

    def check(self) -> str | None:
        if self._total_calls >= self.max_per_execution:
            return f"Rate limit: maximum {self.max_per_execution} tool calls per execution reached. Wrap up your current task."
        now = time.monotonic()
        cutoff = now - 60.0
        self._minute_calls = [t for t in self._minute_calls if t > cutoff]
        if len(self._minute_calls) >= self.max_per_minute:
            return f"Rate limit: maximum {self.max_per_minute} tool calls per minute reached. Please wait before making more tool calls."
        return None

    def record(self) -> None:
        self._total_calls += 1
        self._minute_calls.append(time.monotonic())
