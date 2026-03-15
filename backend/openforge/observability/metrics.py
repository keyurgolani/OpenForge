"""Cost, token, and resource accounting helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from openforge.common.time import utc_now


@dataclass(slots=True)
class LLMUsageRecord:
    """Captured usage from a single LLM call."""
    run_id: UUID
    step_id: UUID | None = None
    workspace_id: UUID | None = None
    workflow_id: UUID | None = None
    mission_id: UUID | None = None
    profile_id: UUID | None = None
    model_name: str | None = None
    provider_name: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    estimated_cost_usd: float | None = None
    latency_ms: int | None = None
    success: bool = True
    error_code: str | None = None


@dataclass(slots=True)
class ToolUsageRecord:
    """Captured usage from a single tool call."""
    run_id: UUID
    step_id: UUID | None = None
    workspace_id: UUID | None = None
    workflow_id: UUID | None = None
    mission_id: UUID | None = None
    tool_name: str | None = None
    latency_ms: int | None = None
    success: bool = True
    error_code: str | None = None


# Simple cost estimates per 1M tokens (input/output) for common models
_MODEL_COST_MAP: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-opus": (15.00, 75.00),
    "claude-3-haiku": (0.25, 1.25),
    "claude-sonnet-4": (3.00, 15.00),
    "claude-opus-4": (15.00, 75.00),
}


def estimate_cost(model_name: str | None, input_tokens: int, output_tokens: int) -> float | None:
    """Estimate USD cost for a model call. Returns None if model unknown."""
    if not model_name:
        return None
    key = model_name.lower().strip()
    for model_key, (input_price, output_price) in _MODEL_COST_MAP.items():
        if model_key in key:
            return (input_tokens * input_price + output_tokens * output_price) / 1_000_000
    return None


@dataclass(slots=True)
class UsageAggregation:
    """Aggregated usage summary."""
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_reasoning_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_requests: int = 0
    total_tool_calls: int = 0
    total_llm_calls: int = 0
    avg_latency_ms: float | None = None
    model_breakdown: dict[str, dict[str, Any]] = field(default_factory=dict)
    tool_breakdown: dict[str, dict[str, Any]] = field(default_factory=dict)
    failure_count: int = 0


def aggregate_usage_records(records: list[dict[str, Any]]) -> UsageAggregation:
    """Aggregate a list of usage record dicts into a summary."""
    agg = UsageAggregation()
    latencies: list[int] = []

    for rec in records:
        record_type = rec.get("record_type", "")
        tokens_in = rec.get("input_tokens", 0) or 0
        tokens_out = rec.get("output_tokens", 0) or 0
        tokens_reason = rec.get("reasoning_tokens", 0) or 0
        cost = rec.get("estimated_cost_usd") or 0.0
        latency = rec.get("latency_ms")

        agg.total_input_tokens += tokens_in
        agg.total_output_tokens += tokens_out
        agg.total_reasoning_tokens += tokens_reason
        agg.total_tokens += tokens_in + tokens_out + tokens_reason
        agg.total_cost_usd += cost
        agg.total_requests += 1

        if latency is not None:
            latencies.append(latency)

        if not rec.get("success", True):
            agg.failure_count += 1

        if record_type == "llm_call":
            agg.total_llm_calls += 1
            model = rec.get("model_name") or "unknown"
            if model not in agg.model_breakdown:
                agg.model_breakdown[model] = {"requests": 0, "tokens": 0, "cost": 0.0}
            agg.model_breakdown[model]["requests"] += 1
            agg.model_breakdown[model]["tokens"] += tokens_in + tokens_out + tokens_reason
            agg.model_breakdown[model]["cost"] += cost
        elif record_type == "tool_call":
            agg.total_tool_calls += 1
            tool = rec.get("tool_name") or "unknown"
            if tool not in agg.tool_breakdown:
                agg.tool_breakdown[tool] = {"invocations": 0, "failures": 0, "avg_latency_ms": 0}
            agg.tool_breakdown[tool]["invocations"] += 1
            if not rec.get("success", True):
                agg.tool_breakdown[tool]["failures"] += 1

    if latencies:
        agg.avg_latency_ms = sum(latencies) / len(latencies)

    # Compute per-tool avg latency
    for tool, info in agg.tool_breakdown.items():
        tool_latencies = [
            r.get("latency_ms", 0)
            for r in records
            if r.get("tool_name") == tool and r.get("latency_ms") is not None
        ]
        if tool_latencies:
            info["avg_latency_ms"] = sum(tool_latencies) / len(tool_latencies)

    return agg
