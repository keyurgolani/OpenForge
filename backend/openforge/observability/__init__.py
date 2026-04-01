"""
OpenForge Observability Package

Provides tracing, metrics, failure taxonomy, cost accounting,
and structured telemetry events for runtime observability.
"""

from .tracing import (
    TraceContext,
    Span,
    get_trace_context,
    set_trace_context,
    clear_trace_context,
    create_span,
    create_run_trace_context,
)
from .metrics import (
    LLMUsageRecord,
    ToolUsageRecord,
    UsageAggregation,
    aggregate_usage_records,
    estimate_cost,
)
from .events import (
    TelemetryEvent,
    USAGE_RECORDED,
    FAILURE_RECORDED,
    COST_THRESHOLD_WARNING,
    APPROVAL_OUTCOME_RECORDED,
)
from .failure_taxonomy import (
    FailureSeverity,
    Retryability,
    FailureClassification,
    StructuredError,
    classify_failure,
    classify_error_code,
    FAILURE_TAXONOMY,
)
from .cost_accounting import CostAccountingService
from .failure_recording import FailureRecordingService

__all__ = [
    # Tracing
    "TraceContext",
    "Span",
    "get_trace_context",
    "set_trace_context",
    "clear_trace_context",
    "create_span",
    "create_run_trace_context",
    # Metrics
    "LLMUsageRecord",
    "ToolUsageRecord",
    "UsageAggregation",
    "aggregate_usage_records",
    "estimate_cost",
    # Telemetry events
    "TelemetryEvent",
    "USAGE_RECORDED",
    "FAILURE_RECORDED",
    "COST_THRESHOLD_WARNING",
    "APPROVAL_OUTCOME_RECORDED",
    # Failure taxonomy
    "FailureSeverity",
    "Retryability",
    "FailureClassification",
    "StructuredError",
    "classify_failure",
    "classify_error_code",
    "FAILURE_TAXONOMY",
    # Services
    "CostAccountingService",
    "FailureRecordingService",
]
