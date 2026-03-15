"""Failure taxonomy and structured error classification."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class FailureSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class Retryability(str, Enum):
    RETRYABLE = "retryable"
    NOT_RETRYABLE = "not_retryable"
    CONDITIONAL = "conditional"


@dataclass(slots=True, frozen=True)
class FailureClassification:
    """Classification metadata for a failure class."""
    failure_class: str
    error_code: str
    severity: FailureSeverity
    retryability: Retryability
    description: str


# Canonical failure taxonomy
FAILURE_TAXONOMY: dict[str, FailureClassification] = {
    "prompt_render_failure": FailureClassification(
        failure_class="prompt_render_failure",
        error_code="PROMPT_RENDER_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.NOT_RETRYABLE,
        description="Template rendering or variable resolution failed",
    ),
    "policy_denial": FailureClassification(
        failure_class="policy_denial",
        error_code="POLICY_DENIED",
        severity=FailureSeverity.WARNING,
        retryability=Retryability.NOT_RETRYABLE,
        description="Tool or action blocked by policy evaluation",
    ),
    "approval_timeout": FailureClassification(
        failure_class="approval_timeout",
        error_code="APPROVAL_TIMEOUT",
        severity=FailureSeverity.WARNING,
        retryability=Retryability.CONDITIONAL,
        description="Approval request expired without resolution",
    ),
    "approval_denied": FailureClassification(
        failure_class="approval_denied",
        error_code="APPROVAL_DENIED",
        severity=FailureSeverity.INFO,
        retryability=Retryability.NOT_RETRYABLE,
        description="Human operator denied the approval",
    ),
    "retrieval_failure": FailureClassification(
        failure_class="retrieval_failure",
        error_code="RETRIEVAL_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.RETRYABLE,
        description="Search or evidence assembly failed",
    ),
    "tool_invocation_failure": FailureClassification(
        failure_class="tool_invocation_failure",
        error_code="TOOL_INVOCATION_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.RETRYABLE,
        description="External tool call failed",
    ),
    "tool_timeout": FailureClassification(
        failure_class="tool_timeout",
        error_code="TOOL_TIMEOUT",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.RETRYABLE,
        description="Tool call exceeded time limit",
    ),
    "model_invocation_failure": FailureClassification(
        failure_class="model_invocation_failure",
        error_code="MODEL_INVOCATION_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.RETRYABLE,
        description="LLM provider returned error",
    ),
    "model_timeout": FailureClassification(
        failure_class="model_timeout",
        error_code="MODEL_TIMEOUT",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.RETRYABLE,
        description="LLM call exceeded time limit",
    ),
    "rate_limit_exceeded": FailureClassification(
        failure_class="rate_limit_exceeded",
        error_code="RATE_LIMIT_EXCEEDED",
        severity=FailureSeverity.WARNING,
        retryability=Retryability.RETRYABLE,
        description="Provider or internal rate limit hit",
    ),
    "workflow_schema_failure": FailureClassification(
        failure_class="workflow_schema_failure",
        error_code="WORKFLOW_SCHEMA_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.NOT_RETRYABLE,
        description="State mapping or validation failed",
    ),
    "join_reduce_failure": FailureClassification(
        failure_class="join_reduce_failure",
        error_code="JOIN_REDUCE_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.NOT_RETRYABLE,
        description="Fan-out join or reduce operation failed",
    ),
    "artifact_emission_failure": FailureClassification(
        failure_class="artifact_emission_failure",
        error_code="ARTIFACT_EMISSION_FAILED",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.RETRYABLE,
        description="Artifact creation or versioning failed",
    ),
    "trigger_scheduler_failure": FailureClassification(
        failure_class="trigger_scheduler_failure",
        error_code="TRIGGER_SCHEDULER_FAILED",
        severity=FailureSeverity.CRITICAL,
        retryability=Retryability.RETRYABLE,
        description="Trigger scheduling or firing failed",
    ),
    "budget_exceeded": FailureClassification(
        failure_class="budget_exceeded",
        error_code="BUDGET_EXCEEDED",
        severity=FailureSeverity.WARNING,
        retryability=Retryability.NOT_RETRYABLE,
        description="Mission budget limit reached",
    ),
    "cooldown_active": FailureClassification(
        failure_class="cooldown_active",
        error_code="COOLDOWN_ACTIVE",
        severity=FailureSeverity.INFO,
        retryability=Retryability.CONDITIONAL,
        description="Mission in cooldown after failure",
    ),
    "checkpoint_write_failure": FailureClassification(
        failure_class="checkpoint_write_failure",
        error_code="CHECKPOINT_WRITE_FAILED",
        severity=FailureSeverity.CRITICAL,
        retryability=Retryability.RETRYABLE,
        description="State checkpoint persistence failed",
    ),
    "unknown_executor": FailureClassification(
        failure_class="unknown_executor",
        error_code="UNKNOWN_EXECUTOR",
        severity=FailureSeverity.ERROR,
        retryability=Retryability.NOT_RETRYABLE,
        description="Node type has no registered executor",
    ),
}


def classify_failure(failure_class: str) -> FailureClassification:
    """Look up classification for a failure class, with a safe fallback."""
    return FAILURE_TAXONOMY.get(
        failure_class,
        FailureClassification(
            failure_class=failure_class,
            error_code=f"UNKNOWN_{failure_class.upper()}",
            severity=FailureSeverity.ERROR,
            retryability=Retryability.NOT_RETRYABLE,
            description=f"Unclassified failure: {failure_class}",
        ),
    )


def classify_error_code(error_code: str) -> FailureClassification | None:
    """Look up classification by error code string (from existing run/step error_code fields)."""
    # Map common runtime error codes to taxonomy classes
    _CODE_TO_CLASS: dict[str, str] = {
        "llm_timeout": "model_timeout",
        "llm_error": "model_invocation_failure",
        "tool_timeout": "tool_timeout",
        "tool_error": "tool_invocation_failure",
        "rate_limit": "rate_limit_exceeded",
        "policy_blocked": "policy_denial",
        "approval_timeout": "approval_timeout",
        "approval_denied": "approval_denied",
        "checkpoint_write_failed": "checkpoint_write_failure",
        "missing_entry_node": "workflow_schema_failure",
        "budget_exhausted": "budget_exceeded",
    }
    mapped = _CODE_TO_CLASS.get(error_code)
    if mapped:
        return FAILURE_TAXONOMY.get(mapped)
    return FAILURE_TAXONOMY.get(error_code)


@dataclass(slots=True)
class StructuredError:
    """Structured error payload for operator-facing display."""
    error_code: str
    failure_class: str
    severity: str
    retryability: str
    summary: str
    detail: dict[str, Any] | None = None
    affected_node_key: str | None = None
    related_policy_id: str | None = None
    related_approval_id: str | None = None

    @classmethod
    def from_classification(
        cls,
        classification: FailureClassification,
        summary: str,
        *,
        detail: dict[str, Any] | None = None,
        affected_node_key: str | None = None,
        related_policy_id: str | None = None,
        related_approval_id: str | None = None,
    ) -> "StructuredError":
        return cls(
            error_code=classification.error_code,
            failure_class=classification.failure_class,
            severity=classification.severity.value,
            retryability=classification.retryability.value,
            summary=summary,
            detail=detail,
            affected_node_key=affected_node_key,
            related_policy_id=related_policy_id,
            related_approval_id=related_approval_id,
        )
