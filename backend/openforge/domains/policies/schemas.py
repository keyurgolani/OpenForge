"""Policy and approval API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .types import ApprovalRequestStatus, ApprovalRequestType, PolicyDecision, PolicyScopeType, PolicyStatus, ToolRiskCategory


class SafetyPolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    scope_type: str = Field(default="system")
    scope_id: Optional[str] = Field(default=None, max_length=255)
    rules: list = Field(default_factory=list)


class ToolPolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    scope_type: str = Field(default="system")
    scope_id: Optional[str] = Field(default=None, max_length=255)
    default_action: str = Field(default="allow")
    allowed_tools: list[str] = Field(default_factory=list)
    blocked_tools: list[str] = Field(default_factory=list)
    approval_required_tools: list[str] = Field(default_factory=list)
    rules: list = Field(default_factory=list)
    rate_limits: dict = Field(default_factory=dict)


class SafetyPolicyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None
    rules: Optional[list] = None
    status: Optional[str] = None


class ToolPolicyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    default_action: PolicyDecision | None = None
    allowed_tools: list[str] | None = None
    blocked_tools: list[str] | None = None
    approval_required_tools: list[str] | None = None
    rules: list[dict[str, Any]] | None = None
    rate_limits: dict[str, Any] | None = None
    status: PolicyStatus | None = None
    updated_by: UUID | None = None


class PolicyResponse(BaseModel):
    id: UUID
    policy_kind: str
    name: str
    description: str | None = None
    scope_type: PolicyScopeType
    scope_id: str | None = None
    default_action: str | None = None
    status: PolicyStatus
    rule_count: int = 0
    affected_tools: list[str] = Field(default_factory=list)
    approval_requirements: list[str] = Field(default_factory=list)
    rate_limits: dict[str, Any] = Field(default_factory=dict)
    rules: list[dict[str, Any]] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    blocked_tools: list[str] = Field(default_factory=list)
    approval_required_tools: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class PolicyListResponse(BaseModel):
    policies: list[PolicyResponse]
    total: int


class PolicySimulationRequest(BaseModel):
    tool_name: str
    risk_category: ToolRiskCategory
    scope_context: dict[str, str | None] = Field(default_factory=dict)
    run_id: str | None = None


class PolicySimulationResponse(BaseModel):
    decision: PolicyDecision
    matched_policy_id: str | None = None
    matched_rule_id: str | None = None
    matched_policy_scope: PolicyScopeType | None = None
    reason_code: str
    reason_text: str
    risk_category: ToolRiskCategory
    rate_limit_state: dict[str, Any] | None = None


class ApprovalRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    request_type: ApprovalRequestType
    scope_type: PolicyScopeType
    scope_id: str | None = None
    source_run_id: UUID | None = None
    requested_action: str
    tool_name: str | None = None
    reason_code: str
    reason_text: str
    risk_category: str
    payload_preview: dict[str, Any] | None = None
    matched_policy_id: UUID | None = None
    matched_rule_id: UUID | None = None
    status: ApprovalRequestStatus
    requested_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    resolution_note: str | None = None


class ApprovalListResponse(BaseModel):
    approvals: list[ApprovalRequestResponse]
    total: int


class ApprovalResolutionRequest(BaseModel):
    resolution_note: str | None = None
