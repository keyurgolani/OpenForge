"""Evaluation runners for different capability suites."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger("openforge.evaluation.runners")


class SuiteRunner:
    """Base runner for an evaluation suite."""

    suite_name: str = "base"

    async def evaluate(self, scenario: dict[str, Any], *, workspace_id: UUID | None = None) -> dict[str, Any]:
        """Run evaluation for a single scenario. Override in subclasses."""
        return {"status": "skipped", "metrics": {}, "reason": "base runner does not execute"}


class RetrievalQualitySuiteRunner(SuiteRunner):
    suite_name = "retrieval"


class PlanningQualitySuiteRunner(SuiteRunner):
    suite_name = "planning"


class SummarizationQualitySuiteRunner(SuiteRunner):
    suite_name = "summarization"


class VerificationQualitySuiteRunner(SuiteRunner):
    suite_name = "verification"


class AutonomyBehaviorSuiteRunner(SuiteRunner):
    suite_name = "autonomy"


class ArtifactQualitySuiteRunner(SuiteRunner):
    suite_name = "artifact_quality"


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
