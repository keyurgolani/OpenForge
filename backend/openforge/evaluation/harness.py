"""Evaluation harness for running benchmark suites against the platform."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from openforge.common.time import utc_now
from openforge.evaluation.runners import get_suite_runner

logger = logging.getLogger("openforge.evaluation.harness")


class EvaluationHarness:
    """Orchestrates running evaluation scenarios and collecting results."""

    def __init__(self, db, evaluation_service):
        self.db = db
        self.evaluation_service = evaluation_service

    async def run_suite(
        self,
        suite_name: str,
        *,
        workspace_id: UUID | None = None,
        baseline_id: UUID | None = None,
        scenario_ids: list[UUID] | None = None,
    ) -> dict[str, Any]:
        """Run all (or selected) scenarios in a suite and return summary."""
        # Create evaluation run
        eval_run = await self.evaluation_service.create_evaluation_run(
            self.db,
            suite_name=suite_name,
            workspace_id=workspace_id,
            baseline_id=baseline_id,
        )
        eval_run_id = eval_run["id"]

        # Load scenarios
        scenarios = await self.evaluation_service.list_scenarios(
            self.db, suite_name=suite_name, is_active=True
        )
        if scenario_ids:
            scenarios = [s for s in scenarios if s["id"] in scenario_ids]

        await self.evaluation_service.update_evaluation_run(
            self.db,
            eval_run_id,
            status="running",
            scenario_count=len(scenarios),
            started_at=utc_now(),
        )

        passed = 0
        failed = 0
        skipped = 0
        total_cost = 0.0
        total_tokens = 0

        for scenario in scenarios:
            try:
                result = await self._run_scenario(eval_run_id, scenario, workspace_id)
                if result["status"] == "passed":
                    passed += 1
                elif result["status"] == "failed":
                    failed += 1
                else:
                    skipped += 1
                total_cost += result.get("cost_usd") or 0.0
                total_tokens += result.get("tokens_used") or 0
            except Exception as exc:
                logger.error("Scenario %s failed with exception: %s", scenario["name"], exc)
                await self.evaluation_service.create_evaluation_result(
                    self.db,
                    evaluation_run_id=eval_run_id,
                    scenario_id=scenario["id"],
                    status="error",
                    error_message=str(exc),
                )
                failed += 1

        await self.evaluation_service.update_evaluation_run(
            self.db,
            eval_run_id,
            status="completed",
            passed_count=passed,
            failed_count=failed,
            skipped_count=skipped,
            total_cost_usd=total_cost,
            total_tokens=total_tokens,
            completed_at=utc_now(),
        )

        return {
            "evaluation_run_id": eval_run_id,
            "suite_name": suite_name,
            "scenario_count": len(scenarios),
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "total_cost_usd": total_cost,
            "total_tokens": total_tokens,
        }

    async def _run_scenario(
        self,
        eval_run_id: UUID,
        scenario: dict[str, Any],
        workspace_id: UUID | None,
    ) -> dict[str, Any]:
        """Execute a single evaluation scenario and record the result."""
        start = utc_now()

        # Invoke the appropriate suite runner for this scenario
        suite_name = scenario.get("suite_name", "base")
        runner = get_suite_runner(suite_name)
        runner_result = await runner.evaluate(scenario, workspace_id=workspace_id)

        execution_status = runner_result.get("status", "completed")
        runner_metrics = runner_result.get("metrics", {})
        runner_duration_ms = runner_result.get("duration_ms", 0)
        runner_error = runner_result.get("error_message")

        # Merge runner metrics into the evaluation metrics
        metrics: dict[str, Any] = {
            "execution_status": execution_status,
            "runner_duration_ms": runner_duration_ms,
            **runner_metrics,
        }
        if runner_error:
            metrics["runner_error"] = runner_error

        threshold_results: dict[str, Any] = {}

        # If the runner itself failed, mark the scenario as failed
        if execution_status == "failed":
            status = "failed"
        else:
            status = "passed"

        # Check each evaluation metric against thresholds
        for metric_def in scenario.get("evaluation_metrics", []):
            metric_name = metric_def.get("name", "")
            threshold = metric_def.get("threshold")
            if threshold is not None and metric_name in metrics:
                actual = metrics[metric_name]
                met = actual >= threshold if isinstance(threshold, (int, float)) else True
                threshold_results[metric_name] = {
                    "threshold": threshold,
                    "actual": actual,
                    "passed": met,
                }
                if not met:
                    status = "failed"

        end = utc_now()
        duration_ms = int((end - start).total_seconds() * 1000)

        result = await self.evaluation_service.create_evaluation_result(
            self.db,
            evaluation_run_id=eval_run_id,
            scenario_id=scenario["id"],
            status=status,
            metrics=metrics,
            threshold_results=threshold_results,
            duration_ms=duration_ms,
            error_message=runner_error,
        )
        return result
