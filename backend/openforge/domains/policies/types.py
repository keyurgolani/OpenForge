"""Policy domain types."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class PolicyScopeType(StrEnum):
    SYSTEM = "system"
    PROFILE = "profile"
    WORKFLOW = "workflow"
    MISSION = "mission"
    WORKSPACE = "workspace"


class PolicyDecision(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRES_APPROVAL = "requires_approval"


class PolicyStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class ToolRiskCategory(StrEnum):
    READ_ONLY = "harmless_read_only"
    RETRIEVAL_SEARCH = "retrieval_search"
    LOCAL_MUTATION = "local_mutation"
    EXTERNAL_MUTATION = "external_mutation"
    SENSITIVE_DATA_ACCESS = "sensitive_data_access"
    NETWORK_EXFILTRATION_RISK = "network_exfiltration_risk"
    DESTRUCTIVE = "destructive"


class ApprovalRequestStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class ApprovalRequestType(StrEnum):
    TOOL_INVOCATION = "tool_invocation"


class PolicyEvaluationResult(BaseModel):
    decision: PolicyDecision
    matched_policy_id: str | None = None
    matched_rule_id: str | None = None
    matched_policy_scope: PolicyScopeType | None = None
    reason_code: str
    reason_text: str
    risk_category: ToolRiskCategory
    rate_limit_state: dict[str, Any] | None = None
