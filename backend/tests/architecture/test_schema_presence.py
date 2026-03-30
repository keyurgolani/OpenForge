"""Core domain schema and package presence tests."""

from openforge.db.models import (
    AgentModel,
    AutomationModel,
    RunModel,
    ArtifactModel,
    TriggerDefinitionModel,
)


def test_core_domain_tables():
    expected = {
        AgentModel: "agents",
        AutomationModel: "automations",
        RunModel: "runs",
        ArtifactModel: "artifacts",
        TriggerDefinitionModel: "trigger_definitions",
    }
    for model, table_name in expected.items():
        assert model.__tablename__ == table_name, f"{model.__name__} table mismatch"


def test_agent_model_fields():
    assert hasattr(AgentModel, "slug")
    assert hasattr(AgentModel, "system_prompt")
    assert hasattr(AgentModel, "llm_config")
    assert hasattr(AgentModel, "tools_config")
    assert hasattr(AgentModel, "active_version_id")


def test_automation_model_fields():
    assert hasattr(AutomationModel, "agent_id")
    assert hasattr(AutomationModel, "budget_config")


def test_run_model_fields():
    assert hasattr(RunModel, "workspace_id")
    assert hasattr(RunModel, "run_type")
    assert hasattr(RunModel, "status")
    assert hasattr(RunModel, "input_payload")
    assert hasattr(RunModel, "output_payload")
