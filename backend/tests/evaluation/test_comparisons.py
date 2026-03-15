"""Tests for run comparison helpers."""

from openforge.evaluation.comparisons import compare_runs, compare_steps


class TestCompareRuns:
    def test_matching_runs(self):
        run_a = {"id": "a", "status": "completed", "total_cost_usd": 1.0, "total_tokens": 1000}
        run_b = {"id": "b", "status": "completed", "total_cost_usd": 1.2, "total_tokens": 1100}
        diff = compare_runs(run_a, run_b)
        assert diff["status"]["match"]
        assert diff["cost"]["a"] == 1.0
        assert diff["cost"]["b"] == 1.2

    def test_different_status(self):
        run_a = {"id": "a", "status": "completed"}
        run_b = {"id": "b", "status": "failed"}
        diff = compare_runs(run_a, run_b)
        assert not diff["status"]["match"]


class TestCompareSteps:
    def test_matching_steps(self):
        steps_a = [{"node_key": "step1", "status": "completed"}, {"node_key": "step2", "status": "completed"}]
        steps_b = [{"node_key": "step1", "status": "completed"}, {"node_key": "step2", "status": "completed"}]
        result = compare_steps(steps_a, steps_b)
        assert result["sequence_match"]
        assert result["total_steps_a"] == 2

    def test_different_step_count(self):
        steps_a = [{"node_key": "step1", "status": "completed"}]
        steps_b = [{"node_key": "step1", "status": "completed"}, {"node_key": "step2", "status": "failed"}]
        result = compare_steps(steps_a, steps_b)
        assert result["total_steps_a"] != result["total_steps_b"]
