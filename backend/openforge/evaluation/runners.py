"""Evaluation runners for different capability suites."""

from __future__ import annotations

import logging
import time
from typing import Any
from uuid import UUID

logger = logging.getLogger("openforge.evaluation.runners")


class SuiteRunner:
    """Base runner for an evaluation suite."""

    suite_name: str = "base"

    # Subclasses should override with fields their scenarios must contain.
    required_scenario_fields: list[str] = ["name"]

    async def evaluate(self, scenario: dict[str, Any], *, workspace_id: UUID | None = None) -> dict[str, Any]:
        """Run evaluation for a single scenario. Override in subclasses."""
        return self.run_scenario(scenario)

    def run_scenario(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Execute a scenario and return a structured result.

        Returns a dict with keys: status, metrics, duration_ms, error_message.
        """
        start_ns = time.monotonic_ns()
        try:
            validation_error = self._validate_scenario(scenario)
            if validation_error:
                duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
                return {
                    "status": "failed",
                    "metrics": {},
                    "duration_ms": duration_ms,
                    "error_message": validation_error,
                }

            metrics = self._execute(scenario)
            duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
            return {
                "status": "completed",
                "metrics": metrics,
                "duration_ms": duration_ms,
                "error_message": None,
            }
        except Exception as exc:
            duration_ms = (time.monotonic_ns() - start_ns) // 1_000_000
            logger.warning("Suite runner %s scenario failed: %s", self.suite_name, exc)
            return {
                "status": "failed",
                "metrics": {},
                "duration_ms": duration_ms,
                "error_message": str(exc),
            }

    def _validate_scenario(self, scenario: dict[str, Any]) -> str | None:
        """Validate that the scenario has required fields. Returns error message or None."""
        missing = [f for f in self.required_scenario_fields if f not in scenario or not scenario[f]]
        if missing:
            return f"Scenario missing required fields: {', '.join(missing)}"
        return None

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Execute scenario logic and return metrics dict. Override in subclasses."""
        return {}


class RetrievalQualitySuiteRunner(SuiteRunner):
    suite_name = "retrieval"
    required_scenario_fields = ["name", "query"]

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Evaluate retrieval quality for a given query scenario.

        Returns empty metrics on successful execution. Full integration with
        the retrieval pipeline will populate precision/recall/MRR metrics.
        """
        logger.info("Running retrieval quality scenario: %s", scenario.get("name"))
        return {}


class PlanningQualitySuiteRunner(SuiteRunner):
    suite_name = "planning"
    required_scenario_fields = ["name", "goal"]

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Evaluate planning quality for a given goal scenario.

        Returns empty metrics on successful execution. Full integration with
        the planning engine will populate step_count/plan_validity metrics.
        """
        logger.info("Running planning quality scenario: %s", scenario.get("name"))
        return {}


class SummarizationQualitySuiteRunner(SuiteRunner):
    suite_name = "summarization"
    required_scenario_fields = ["name", "input_text"]

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Evaluate summarization quality for a given input text scenario.

        Returns empty metrics on successful execution. Full integration with
        the summarization pipeline will populate ROUGE/coherence metrics.
        """
        logger.info("Running summarization quality scenario: %s", scenario.get("name"))
        return {}


class VerificationQualitySuiteRunner(SuiteRunner):
    suite_name = "verification"
    required_scenario_fields = ["name", "claim"]

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Evaluate verification quality for a given claim scenario.

        Returns empty metrics on successful execution. Full integration with
        the verification engine will populate accuracy/evidence_quality metrics.
        """
        logger.info("Running verification quality scenario: %s", scenario.get("name"))
        return {}


class AutonomyBehaviorSuiteRunner(SuiteRunner):
    suite_name = "autonomy"
    required_scenario_fields = ["name", "mission_config"]

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Evaluate autonomy behavior for a given mission config scenario.

        Returns empty metrics on successful execution. Full integration with
        the mission runtime will populate success_rate/intervention_count metrics.
        """
        logger.info("Running autonomy behavior scenario: %s", scenario.get("name"))
        return {}


class ArtifactQualitySuiteRunner(SuiteRunner):
    suite_name = "artifact_quality"
    required_scenario_fields = ["name", "artifact_type"]

    def _execute(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """Evaluate artifact quality for a given artifact type scenario.

        Returns empty metrics on successful execution. Full integration with
        the artifact pipeline will populate usefulness/completeness metrics.
        """
        logger.info("Running artifact quality scenario: %s", scenario.get("name"))
        return {}


# Registry of available suite runners
SUITE_RUNNERS: dict[str, type[SuiteRunner]] = {
    "retrieval": RetrievalQualitySuiteRunner,
    "planning": PlanningQualitySuiteRunner,
    "summarization": SummarizationQualitySuiteRunner,
    "verification": VerificationQualitySuiteRunner,
    "autonomy": AutonomyBehaviorSuiteRunner,
    "artifact_quality": ArtifactQualitySuiteRunner,
}


def get_suite_runner(suite_name: str) -> SuiteRunner:
    runner_cls = SUITE_RUNNERS.get(suite_name, SuiteRunner)
    return runner_cls()
