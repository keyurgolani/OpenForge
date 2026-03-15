"""Phase 14 -- Release candidate smoke tests.

This suite MUST pass for every release candidate. It validates that
core platform concepts, routes, and contracts remain intact.
"""
import importlib
import pytest

from openforge.core.product_vocabulary import (
    API_PREFIXES,
    DOMAIN_LABELS,
    DomainNoun,
)


class TestDomainModelPresence:
    """Verify all core domain models are importable and have required fields."""

    def test_profile_model_has_required_fields(self):
        from openforge.db.models import AgentProfileModel
        required = {"id", "name", "slug", "role", "status", "created_at"}
        actual = {c.name for c in AgentProfileModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_workflow_model_has_required_fields(self):
        from openforge.db.models import WorkflowDefinitionModel
        required = {"id", "workspace_id", "name", "slug", "status", "created_at"}
        actual = {c.name for c in WorkflowDefinitionModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_mission_model_has_required_fields(self):
        from openforge.db.models import MissionDefinitionModel
        required = {"id", "workspace_id", "name", "slug", "status", "created_at"}
        actual = {c.name for c in MissionDefinitionModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_run_model_has_required_fields(self):
        from openforge.db.models import RunModel
        required = {"id", "workspace_id", "status", "run_type", "created_at"}
        actual = {c.name for c in RunModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_artifact_model_has_required_fields(self):
        from openforge.db.models import ArtifactModel
        required = {"id", "workspace_id", "title", "artifact_type", "status", "created_at"}
        actual = {c.name for c in ArtifactModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_trigger_model_has_required_fields(self):
        from openforge.db.models import TriggerDefinitionModel
        required = {"id", "workspace_id", "name", "trigger_type", "status", "created_at"}
        actual = {c.name for c in TriggerDefinitionModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_usage_record_model_exists(self):
        from openforge.db.models import UsageRecordModel
        required = {"id", "record_type", "created_at"}
        actual = {c.name for c in UsageRecordModel.__table__.columns}
        assert required.issubset(actual)

    def test_failure_event_model_exists(self):
        from openforge.db.models import FailureEventModel
        required = {"id", "failure_class", "severity", "created_at"}
        actual = {c.name for c in FailureEventModel.__table__.columns}
        assert required.issubset(actual)

    def test_evaluation_scenario_model_exists(self):
        from openforge.db.models import EvaluationScenarioModel
        required = {"id", "name", "slug", "created_at"}
        actual = {c.name for c in EvaluationScenarioModel.__table__.columns}
        assert required.issubset(actual)


class TestDomainServiceImports:
    """Verify all domain services are importable."""

    @pytest.mark.parametrize("module_path", [
        "openforge.domains.profiles.service",
        "openforge.domains.workflows.service",
        "openforge.domains.missions.service",
        "openforge.domains.triggers.service",
        "openforge.domains.runs.service",
        "openforge.domains.artifacts.service",
        "openforge.domains.graph.service",
        "openforge.domains.catalog.service",
        "openforge.domains.policies.service",
        "openforge.domains.prompts.service",
        "openforge.domains.retrieval.service",
        "openforge.domains.capability_bundles.service",
        "openforge.domains.model_policies.service",
        "openforge.domains.memory_policies.service",
        "openforge.domains.output_contracts.service",
    ])
    def test_service_importable(self, module_path):
        mod = importlib.import_module(module_path)
        assert mod is not None


class TestDomainRouterRegistration:
    """Verify all domain routers can be registered."""

    def test_register_domain_routers_succeeds(self):
        from fastapi import FastAPI
        from openforge.domains.router_registry import register_domain_routers
        app = FastAPI()
        register_domain_routers(app)
        # After registration, the app should have routers for all major domains
        route_paths = [r.path for r in app.routes]
        assert len(route_paths) >= 10, f"Expected at least 10 routes, got {len(route_paths)}"


class TestProductVocabularyConsistency:
    """Verify product vocabulary is consistent."""

    def test_api_prefixes_defined(self):
        required_nouns = [
            DomainNoun.PROFILE,
            DomainNoun.WORKFLOW,
            DomainNoun.MISSION,
            DomainNoun.TRIGGER,
            DomainNoun.RUN,
            DomainNoun.ARTIFACT,
            DomainNoun.CATALOG,
            DomainNoun.OBSERVABILITY,
            DomainNoun.EVALUATION,
        ]
        for noun in required_nouns:
            assert noun in API_PREFIXES, f"Missing API prefix for: {noun}"

    def test_domain_labels_defined(self):
        required_nouns = [
            DomainNoun.PROFILE,
            DomainNoun.WORKFLOW,
            DomainNoun.MISSION,
            DomainNoun.TRIGGER,
            DomainNoun.RUN,
            DomainNoun.ARTIFACT,
        ]
        for noun in required_nouns:
            assert noun in DOMAIN_LABELS, f"Missing domain label for: {noun}"


class TestObservabilityContracts:
    """Verify observability infrastructure is intact."""

    def test_failure_taxonomy_has_all_classes(self):
        from openforge.observability.failure_taxonomy import FAILURE_TAXONOMY
        required_classes = [
            "prompt_render_failure",
            "policy_denial",
            "approval_timeout",
            "tool_invocation_failure",
            "model_timeout",
            "rate_limit_exceeded",
            "workflow_schema_failure",
            "budget_exceeded",
        ]
        for cls in required_classes:
            assert cls in FAILURE_TAXONOMY, f"Missing failure class: {cls}"

    def test_cost_accounting_service_importable(self):
        from openforge.observability.cost_accounting import CostAccountingService
        assert CostAccountingService is not None

    def test_failure_recording_service_importable(self):
        from openforge.observability.failure_recording import FailureRecordingService
        assert FailureRecordingService is not None


class TestEvaluationContracts:
    """Verify evaluation framework is intact."""

    def test_evaluation_service_importable(self):
        from openforge.evaluation.service import EvaluationService
        assert EvaluationService is not None

    def test_evaluation_runners_importable(self):
        from openforge.evaluation.runners import (
            RetrievalQualitySuiteRunner,
            PlanningQualitySuiteRunner,
            SummarizationQualitySuiteRunner,
            VerificationQualitySuiteRunner,
            AutonomyBehaviorSuiteRunner,
            ArtifactQualitySuiteRunner,
        )
        assert all([
            RetrievalQualitySuiteRunner,
            PlanningQualitySuiteRunner,
            SummarizationQualitySuiteRunner,
            VerificationQualitySuiteRunner,
            AutonomyBehaviorSuiteRunner,
            ArtifactQualitySuiteRunner,
        ])

    def test_suite_runner_registry_complete(self):
        from openforge.evaluation.runners import SUITE_RUNNERS
        expected_suites = [
            "retrieval", "planning", "summarization",
            "verification", "autonomy", "artifact_quality",
        ]
        for suite in expected_suites:
            assert suite in SUITE_RUNNERS, f"Missing suite runner: {suite}"


class TestSeedDataContracts:
    """Verify seed data is available and well-formed."""

    def test_profile_seed_blueprints_available(self):
        from openforge.domains.profiles.seed import get_seed_profile_blueprints
        blueprints = get_seed_profile_blueprints()
        assert len(blueprints) >= 10, f"Expected at least 10 profile blueprints, got {len(blueprints)}"
        for bp in blueprints:
            assert "name" in bp, "Blueprint missing 'name'"
            assert "slug" in bp, "Blueprint missing 'slug'"
            assert "role" in bp, "Blueprint missing 'role'"

    def test_workflow_seed_blueprints_available(self):
        from openforge.domains.workflows.seed import get_seed_workflow_blueprints
        blueprints = get_seed_workflow_blueprints()
        assert len(blueprints) >= 8, f"Expected at least 8 workflow blueprints, got {len(blueprints)}"
        for bp in blueprints:
            assert "name" in bp, "Blueprint missing 'name'"
            assert "slug" in bp, "Blueprint missing 'slug'"

    def test_mission_seed_blueprints_available(self):
        from openforge.domains.missions.seed import get_seed_mission_blueprints
        blueprints = get_seed_mission_blueprints()
        assert len(blueprints) >= 8, f"Expected at least 8 mission blueprints, got {len(blueprints)}"
        for bp in blueprints:
            assert "name" in bp, "Blueprint missing 'name'"
            assert "slug" in bp, "Blueprint missing 'slug'"


class TestRuntimeContracts:
    """Verify runtime execution components are intact."""

    def test_node_executor_registry_importable(self):
        from openforge.runtime.node_executors.registry import NodeExecutorRegistry
        registry = NodeExecutorRegistry()
        assert registry is not None

    def test_build_default_registry_importable(self):
        from openforge.runtime.node_executors.registry import build_default_registry
        assert callable(build_default_registry)

    def test_execution_engine_importable(self):
        from openforge.runtime.execution_engine import AgentExecutionEngine
        assert AgentExecutionEngine is not None

    def test_coordinator_importable(self):
        from openforge.runtime.coordinator import RuntimeCoordinator
        assert RuntimeCoordinator is not None
