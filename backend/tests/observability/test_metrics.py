"""Tests for observability metrics and cost accounting helpers."""

from openforge.observability.metrics import (
    estimate_cost,
    aggregate_usage_records,
    UsageAggregation,
)


class TestEstimateCost:
    def test_known_model(self):
        cost = estimate_cost("gpt-4o", input_tokens=1000, output_tokens=500)
        assert cost is not None
        assert cost > 0

    def test_unknown_model(self):
        cost = estimate_cost("unknown-model-xyz", input_tokens=1000, output_tokens=500)
        assert cost is None

    def test_none_model(self):
        cost = estimate_cost(None, input_tokens=1000, output_tokens=500)
        assert cost is None

    def test_partial_model_match(self):
        # Should match "gpt-4o" within "openai/gpt-4o-2024"
        cost = estimate_cost("openai/gpt-4o-2024", input_tokens=1000000, output_tokens=500000)
        assert cost is not None


class TestAggregateUsage:
    def test_empty_records(self):
        agg = aggregate_usage_records([])
        assert agg.total_tokens == 0
        assert agg.total_cost_usd == 0.0
        assert agg.total_requests == 0

    def test_llm_records(self):
        records = [
            {
                "record_type": "llm_call",
                "model_name": "gpt-4o",
                "input_tokens": 100,
                "output_tokens": 50,
                "reasoning_tokens": 0,
                "estimated_cost_usd": 0.001,
                "latency_ms": 500,
                "success": True,
            },
            {
                "record_type": "llm_call",
                "model_name": "gpt-4o",
                "input_tokens": 200,
                "output_tokens": 100,
                "reasoning_tokens": 10,
                "estimated_cost_usd": 0.002,
                "latency_ms": 600,
                "success": True,
            },
        ]
        agg = aggregate_usage_records(records)
        assert agg.total_input_tokens == 300
        assert agg.total_output_tokens == 150
        assert agg.total_reasoning_tokens == 10
        assert agg.total_tokens == 460
        assert agg.total_llm_calls == 2
        assert agg.total_cost_usd == 0.003
        assert agg.avg_latency_ms == 550.0
        assert "gpt-4o" in agg.model_breakdown

    def test_tool_records(self):
        records = [
            {
                "record_type": "tool_call",
                "tool_name": "web_search",
                "input_tokens": 0,
                "output_tokens": 0,
                "latency_ms": 200,
                "success": True,
            },
            {
                "record_type": "tool_call",
                "tool_name": "web_search",
                "input_tokens": 0,
                "output_tokens": 0,
                "latency_ms": 300,
                "success": False,
            },
        ]
        agg = aggregate_usage_records(records)
        assert agg.total_tool_calls == 2
        assert agg.failure_count == 1
        assert "web_search" in agg.tool_breakdown
        assert agg.tool_breakdown["web_search"]["failures"] == 1
