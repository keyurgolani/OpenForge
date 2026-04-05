"""Release candidate smoke tests.

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

    def test_agent_model_has_required_fields(self):
        from openforge.db.models import AgentModel
        required = {"id", "name", "slug", "system_prompt", "llm_config", "active_version_id", "created_at"}
        actual = {c.name for c in AgentModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_automation_model_has_required_fields(self):
        from openforge.db.models import AutomationModel
        required = {"id", "name", "slug", "status", "created_at"}
        actual = {c.name for c in AutomationModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_run_model_has_required_fields(self):
        from openforge.db.models import RunModel
        required = {"id", "status", "run_type", "created_at"}
        actual = {c.name for c in RunModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"

    def test_artifact_model_has_required_fields(self):
        from openforge.db.models import ArtifactModel
        required = {"id", "workspace_id", "title", "artifact_type", "created_at"}
        actual = {c.name for c in ArtifactModel.__table__.columns}
        assert required.issubset(actual), f"Missing fields: {required - actual}"


class TestProductVocabulary:
    """Verify product vocabulary is complete and consistent."""

    def test_all_nouns_have_labels(self):
        for noun in DomainNoun:
            assert noun in DOMAIN_LABELS, f"Missing label for {noun}"

    def test_all_nouns_have_api_prefixes(self):
        for noun in DomainNoun:
            assert noun in API_PREFIXES, f"Missing API prefix for {noun}"


class TestRuntimeContracts:
    """Verify runtime execution components are intact."""

    def test_chat_handler_importable(self):
        from openforge.runtime.chat_handler import ChatHandler
        assert ChatHandler is not None

    def test_agent_executor_importable(self):
        from openforge.runtime.agent_executor import execute_agent
        assert execute_agent is not None

    def test_agent_registry_importable(self):
        from openforge.runtime.agent_registry import AgentRegistry
        assert AgentRegistry is not None

    def test_tool_loop_importable(self):
        from openforge.runtime.tool_loop import execute_tool_loop
        assert callable(execute_tool_loop)

    def test_hitl_service_importable(self):
        from openforge.runtime.hitl import HITLService
        assert HITLService is not None

    def test_policy_engine_importable(self):
        from openforge.runtime.policy import PolicyEngine
        assert PolicyEngine is not None

    def test_graph_executor_importable(self):
        from openforge.runtime.graph_executor import GraphExecutor
        assert GraphExecutor is not None
