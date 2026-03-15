from __future__ import annotations

from uuid import uuid4

from openforge.domains.policies.evaluator import PolicyEvaluator
from openforge.domains.policies.types import PolicyDecision, PolicyScopeType, ToolRiskCategory


def _policy(
    *,
    scope_type: PolicyScopeType = PolicyScopeType.SYSTEM,
    scope_id: str | None = None,
    default_action: str = "allow",
    allowed_tools: list[str] | None = None,
    blocked_tools: list[str] | None = None,
    approval_required_tools: list[str] | None = None,
    rate_limits: dict | None = None,
):
    return {
        "id": str(uuid4()),
        "name": f"{scope_type.value}-policy",
        "scope_type": scope_type.value,
        "scope_id": scope_id,
        "default_action": default_action,
        "allowed_tools": allowed_tools or [],
        "blocked_tools": blocked_tools or [],
        "approval_required_tools": approval_required_tools or [],
        "rate_limits": rate_limits or {},
        "rules": [],
        "status": "active",
    }


def test_policy_evaluator_allows_tools_via_matching_policy():
    evaluator = PolicyEvaluator()

    result = evaluator.evaluate_tool_access(
        tool_name="workspace.search",
        risk_category=ToolRiskCategory.RETRIEVAL_SEARCH,
        policies=[_policy(allowed_tools=["workspace.search"])],
        scope_context={},
        run_id="run-1",
    )

    assert result.decision is PolicyDecision.ALLOW
    assert result.reason_code == "tool_allowed"


def test_policy_evaluator_requires_approval_for_approval_required_tools():
    evaluator = PolicyEvaluator()

    result = evaluator.evaluate_tool_access(
        tool_name="shell.execute",
        risk_category=ToolRiskCategory.LOCAL_MUTATION,
        policies=[_policy(approval_required_tools=["shell.execute"])],
        scope_context={},
        run_id="run-1",
    )

    assert result.decision is PolicyDecision.REQUIRES_APPROVAL
    assert result.reason_code == "tool_requires_approval"


def test_policy_evaluator_applies_more_specific_scope_precedence():
    workspace_id = str(uuid4())
    mission_id = str(uuid4())
    evaluator = PolicyEvaluator()

    result = evaluator.evaluate_tool_access(
        tool_name="workspace.delete_knowledge",
        risk_category=ToolRiskCategory.DESTRUCTIVE,
        policies=[
            _policy(
                scope_type=PolicyScopeType.WORKSPACE,
                scope_id=workspace_id,
                allowed_tools=["workspace.delete_knowledge"],
            ),
            _policy(
                scope_type=PolicyScopeType.MISSION,
                scope_id=mission_id,
                blocked_tools=["workspace.delete_knowledge"],
            ),
        ],
        scope_context={"workspace_id": workspace_id, "mission_id": mission_id},
        run_id="run-1",
    )

    assert result.decision is PolicyDecision.DENY
    assert result.reason_code == "tool_blocked"
    assert result.matched_policy_scope == PolicyScopeType.MISSION


def test_policy_evaluator_denies_when_run_scoped_rate_limit_is_exceeded():
    evaluator = PolicyEvaluator()
    policy = _policy(
        approval_required_tools=[],
        rate_limits={"shell.execute": {"per_run": 1}},
    )

    evaluator.record_tool_invocation("run-1", "shell.execute")
    result = evaluator.evaluate_tool_access(
        tool_name="shell.execute",
        risk_category=ToolRiskCategory.LOCAL_MUTATION,
        policies=[policy],
        scope_context={},
        run_id="run-1",
    )

    assert result.decision is PolicyDecision.DENY
    assert result.reason_code == "rate_limit_exceeded"
    assert result.rate_limit_state["per_run_remaining"] == 0
    assert result.risk_category is ToolRiskCategory.LOCAL_MUTATION
