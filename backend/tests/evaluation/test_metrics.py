"""Tests for evaluation metric comparison."""

from openforge.evaluation.metrics import compare_metrics, MetricComparison


class TestCompareMetrics:
    def test_no_regression(self):
        current = {"accuracy": 0.95, "latency": 100}
        baseline = {"accuracy": 0.93, "latency": 120}
        thresholds = {
            "accuracy": {"direction": "higher_is_better", "critical_threshold": 10},
            "latency": {"direction": "lower_is_better", "critical_threshold": 20},
        }
        results = compare_metrics(current, baseline, thresholds)
        assert all(not r.regression for r in results)

    def test_regression_detected(self):
        current = {"accuracy": 0.70}
        baseline = {"accuracy": 0.95}
        thresholds = {
            "accuracy": {"direction": "higher_is_better", "critical_threshold": 10},
        }
        results = compare_metrics(current, baseline, thresholds)
        accuracy = [r for r in results if r.metric_name == "accuracy"][0]
        assert accuracy.regression

    def test_missing_metric_warning(self):
        current = {}
        baseline = {"accuracy": 0.95}
        thresholds = {}
        results = compare_metrics(current, baseline, thresholds)
        accuracy = [r for r in results if r.metric_name == "accuracy"][0]
        assert accuracy.warning
        assert accuracy.current_value is None

    def test_cost_regression(self):
        current = {"cost_usd": 15.0}
        baseline = {"cost_usd": 10.0}
        thresholds = {
            "cost_usd": {"direction": "lower_is_better", "critical_threshold": 30},
        }
        results = compare_metrics(current, baseline, thresholds)
        cost = [r for r in results if r.metric_name == "cost_usd"][0]
        assert cost.regression  # 50% increase > 30% threshold
