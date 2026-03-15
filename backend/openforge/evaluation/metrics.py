"""Evaluation metric computation and comparison helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class MetricComparison:
    metric_name: str
    baseline_value: float | None
    current_value: float | None
    threshold: float | None
    delta: float | None
    delta_pct: float | None
    regression: bool
    warning: bool


def compare_metrics(
    current: dict[str, Any],
    baseline: dict[str, Any],
    thresholds: dict[str, Any],
) -> list[MetricComparison]:
    """Compare current metrics against a baseline with thresholds."""
    results: list[MetricComparison] = []

    all_keys = set(current.keys()) | set(baseline.keys())
    for key in sorted(all_keys):
        current_val = current.get(key)
        baseline_val = baseline.get(key)
        threshold_cfg = thresholds.get(key, {})

        if current_val is None or baseline_val is None:
            results.append(MetricComparison(
                metric_name=key,
                baseline_value=baseline_val,
                current_value=current_val,
                threshold=None,
                delta=None,
                delta_pct=None,
                regression=False,
                warning=current_val is None and baseline_val is not None,
            ))
            continue

        try:
            c = float(current_val)
            b = float(baseline_val)
        except (TypeError, ValueError):
            continue

        delta = c - b
        delta_pct = (delta / b * 100) if b != 0 else None

        warning_threshold = threshold_cfg.get("warning_threshold")
        critical_threshold = threshold_cfg.get("critical_threshold")
        direction = threshold_cfg.get("direction", "higher_is_better")

        regression = False
        warning = False

        if direction == "higher_is_better":
            if critical_threshold is not None and delta_pct is not None and delta_pct < -critical_threshold:
                regression = True
            elif warning_threshold is not None and delta_pct is not None and delta_pct < -warning_threshold:
                warning = True
        elif direction == "lower_is_better":
            if critical_threshold is not None and delta_pct is not None and delta_pct > critical_threshold:
                regression = True
            elif warning_threshold is not None and delta_pct is not None and delta_pct > warning_threshold:
                warning = True

        results.append(MetricComparison(
            metric_name=key,
            baseline_value=b,
            current_value=c,
            threshold=critical_threshold,
            delta=delta,
            delta_pct=delta_pct,
            regression=regression,
            warning=warning,
        ))

    return results
