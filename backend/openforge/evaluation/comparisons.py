"""Run comparison and diff helpers for debugging and evaluation."""

from __future__ import annotations

from typing import Any
from uuid import UUID


def compare_runs(run_a: dict[str, Any], run_b: dict[str, Any]) -> dict[str, Any]:
    """Compare two runs and return a structured diff."""
    return {
        "run_a_id": run_a.get("id"),
        "run_b_id": run_b.get("id"),
        "status": {
            "a": run_a.get("status"),
            "b": run_b.get("status"),
            "match": run_a.get("status") == run_b.get("status"),
        },
        "step_count": {
            "a": run_a.get("step_count", 0),
            "b": run_b.get("step_count", 0),
        },
        "cost": {
            "a": run_a.get("total_cost_usd"),
            "b": run_b.get("total_cost_usd"),
        },
        "tokens": {
            "a": run_a.get("total_tokens"),
            "b": run_b.get("total_tokens"),
        },
        "artifacts": {
            "a": run_a.get("artifact_count", 0),
            "b": run_b.get("artifact_count", 0),
        },
        "duration_ms": {
            "a": run_a.get("duration_ms"),
            "b": run_b.get("duration_ms"),
        },
        "error": {
            "a": run_a.get("error_code"),
            "b": run_b.get("error_code"),
        },
    }


def compare_steps(steps_a: list[dict[str, Any]], steps_b: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare step sequences from two runs."""
    max_len = max(len(steps_a), len(steps_b))
    step_diffs: list[dict[str, Any]] = []

    for i in range(max_len):
        sa = steps_a[i] if i < len(steps_a) else None
        sb = steps_b[i] if i < len(steps_b) else None
        step_diffs.append({
            "index": i,
            "a": {"node_key": sa.get("node_key") if sa else None, "status": sa.get("status") if sa else None},
            "b": {"node_key": sb.get("node_key") if sb else None, "status": sb.get("status") if sb else None},
            "match": (sa.get("node_key") if sa else None) == (sb.get("node_key") if sb else None),
        })

    return {
        "total_steps_a": len(steps_a),
        "total_steps_b": len(steps_b),
        "step_diffs": step_diffs,
        "sequence_match": all(d["match"] for d in step_diffs),
    }
