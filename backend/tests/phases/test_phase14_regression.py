"""Phase 14 -- Regression tests for cross-domain integration.

These tests verify that the assembled platform maintains consistency
across domain boundaries, terminology, and contracts.
"""
import pathlib

import pytest


class TestTerminologyConsistency:
    """Verify no legacy terminology leaks into public APIs."""

    def test_no_agent_definition_in_profile_schemas(self):
        """Profile schemas should not reference AgentDefinition."""
        from openforge.domains.profiles import schemas
        source = pathlib.Path(schemas.__file__).read_text()
        assert "AgentDefinition" not in source, "Legacy AgentDefinition reference in profile schemas"

    def test_no_hand_terminology_in_missions(self):
        """Mission code should not reference 'Hand' concept as a product term."""
        from openforge.domains.missions import service
        source = pathlib.Path(service.__file__).read_text().lower()
        # Allow 'handler', 'handle', 'handoff' but reject bare 'hand' used as product concept
        lines_with_hand = [
            line for line in source.splitlines()
            if "hand" in line
            and "handler" not in line
            and "handle" not in line
            and "handoff" not in line
            and "hand_" not in line
        ]
        assert not lines_with_hand, (
            f"Legacy 'Hand' terminology in mission service: {lines_with_hand[:3]}"
        )

    def test_product_vocabulary_completeness(self):
        """Product vocabulary should cover all domain concepts."""
        from openforge.core.product_vocabulary import DOMAIN_LABELS, DomainNoun
        required = [
            DomainNoun.PROFILE,
            DomainNoun.WORKFLOW,
            DomainNoun.MISSION,
            DomainNoun.TRIGGER,
            DomainNoun.RUN,
            DomainNoun.ARTIFACT,
        ]
        for domain in required:
            assert domain in DOMAIN_LABELS, f"Missing domain in vocabulary: {domain}"


class TestCrossDomainContracts:
    """Verify cross-domain data contracts are consistent."""

    def test_run_model_references_workflow(self):
        from openforge.db.models import RunModel
        columns = {c.name for c in RunModel.__table__.columns}
        assert "workflow_id" in columns, "Run must reference workflow"

    def test_run_model_references_mission(self):
        from openforge.db.models import RunModel
        columns = {c.name for c in RunModel.__table__.columns}
        assert "mission_id" in columns, "Run must reference mission"

    def test_artifact_model_references_run(self):
        from openforge.db.models import ArtifactModel
        columns = {c.name for c in ArtifactModel.__table__.columns}
        assert "source_run_id" in columns, "Artifact must reference source run"

    def test_trigger_references_target(self):
        from openforge.db.models import TriggerDefinitionModel
        columns = {c.name for c in TriggerDefinitionModel.__table__.columns}
        assert "target_id" in columns, "Trigger must reference target"

    def test_usage_record_references_run(self):
        from openforge.db.models import UsageRecordModel
        columns = {c.name for c in UsageRecordModel.__table__.columns}
        assert "run_id" in columns, "Usage record must reference run"

    def test_failure_event_references_run(self):
        from openforge.db.models import FailureEventModel
        columns = {c.name for c in FailureEventModel.__table__.columns}
        assert "run_id" in columns, "Failure event must reference run"


class TestMigrationChainIntegrity:
    """Verify migration chain is complete and ordered."""

    def test_migration_files_exist(self):
        migrations_dir = (
            pathlib.Path(__file__).parent.parent.parent
            / "openforge" / "db" / "migrations" / "versions"
        )
        migration_files = sorted(migrations_dir.glob("*.py"))
        # Filter out __init__ and __pycache__
        migration_files = [f for f in migration_files if not f.name.startswith("__")]
        assert len(migration_files) >= 10, (
            f"Expected at least 10 migrations, found {len(migration_files)}"
        )

    def test_latest_migration_is_phase13(self):
        migrations_dir = (
            pathlib.Path(__file__).parent.parent.parent
            / "openforge" / "db" / "migrations" / "versions"
        )
        migration_files = sorted(migrations_dir.glob("*.py"))
        migration_files = [f for f in migration_files if not f.name.startswith("__")]
        latest = migration_files[-1].name
        assert "phase13" in latest or "012" in latest, (
            f"Latest migration should be Phase 13, got: {latest}"
        )

    def test_migration_numbering_sequential(self):
        """Migration file numbering should be sequential with no gaps in prefix."""
        migrations_dir = (
            pathlib.Path(__file__).parent.parent.parent
            / "openforge" / "db" / "migrations" / "versions"
        )
        migration_files = sorted(migrations_dir.glob("*.py"))
        migration_files = [f for f in migration_files if not f.name.startswith("__")]
        prefixes = []
        for f in migration_files:
            prefix = f.name.split("_")[0]
            if prefix.isdigit():
                prefixes.append(int(prefix))
        assert prefixes == sorted(prefixes), "Migration prefixes are not in order"
        for i in range(len(prefixes) - 1):
            assert prefixes[i + 1] == prefixes[i] + 1, (
                f"Gap in migration numbering between {prefixes[i]:03d} and {prefixes[i+1]:03d}"
            )


class TestObservabilityModelContracts:
    """Verify observability and evaluation models are wired correctly."""

    def test_evaluation_scenario_has_suite_name(self):
        from openforge.db.models import EvaluationScenarioModel
        columns = {c.name for c in EvaluationScenarioModel.__table__.columns}
        assert "suite_name" in columns, "EvaluationScenario must have suite_name"

    def test_evaluation_run_has_status(self):
        from openforge.db.models import EvaluationRunModel
        columns = {c.name for c in EvaluationRunModel.__table__.columns}
        assert "status" in columns, "EvaluationRun must have status"

    def test_evaluation_result_references_scenario_and_run(self):
        from openforge.db.models import EvaluationResultModel
        columns = {c.name for c in EvaluationResultModel.__table__.columns}
        assert "evaluation_run_id" in columns, "EvaluationResult must reference evaluation run"
        assert "scenario_id" in columns, "EvaluationResult must reference scenario"

    def test_evaluation_baseline_has_thresholds(self):
        from openforge.db.models import EvaluationBaselineModel
        columns = {c.name for c in EvaluationBaselineModel.__table__.columns}
        assert "thresholds" in columns, "EvaluationBaseline must have thresholds"

    def test_failure_event_has_classification_fields(self):
        from openforge.db.models import FailureEventModel
        columns = {c.name for c in FailureEventModel.__table__.columns}
        assert "failure_class" in columns
        assert "error_code" in columns
        assert "severity" in columns
        assert "retryability" in columns

    def test_usage_record_has_token_fields(self):
        from openforge.db.models import UsageRecordModel
        columns = {c.name for c in UsageRecordModel.__table__.columns}
        assert "input_tokens" in columns
        assert "output_tokens" in columns
        assert "total_tokens" in columns
        assert "estimated_cost_usd" in columns


class TestFailureTaxonomyCompleteness:
    """Verify failure taxonomy covers runtime error scenarios."""

    def test_classify_failure_returns_valid_classification(self):
        from openforge.observability.failure_taxonomy import classify_failure
        result = classify_failure("model_timeout")
        assert result.failure_class == "model_timeout"
        assert result.error_code is not None
        assert result.severity is not None

    def test_classify_failure_handles_unknown(self):
        from openforge.observability.failure_taxonomy import classify_failure
        result = classify_failure("nonexistent_failure_class")
        assert result.failure_class == "nonexistent_failure_class"
        # Should return a safe fallback, not raise

    def test_classify_error_code_maps_runtime_codes(self):
        from openforge.observability.failure_taxonomy import classify_error_code
        # Known runtime error codes should map to taxonomy classes
        result = classify_error_code("llm_timeout")
        assert result is not None
        assert result.failure_class == "model_timeout"

    def test_structured_error_from_classification(self):
        from openforge.observability.failure_taxonomy import (
            StructuredError,
            classify_failure,
        )
        classification = classify_failure("policy_denial")
        error = StructuredError.from_classification(
            classification,
            summary="Tool blocked by safety policy",
        )
        assert error.failure_class == "policy_denial"
        assert error.summary == "Tool blocked by safety policy"
