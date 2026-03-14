"""
Phase 1 schema and package presence tests.
"""

from importlib import import_module

from openforge.db.base import Base
from openforge.db.models import (
    AgentProfileModel,
    ArtifactModel,
    MissionDefinitionModel,
    RunModel,
    TriggerDefinitionModel,
    WorkflowDefinitionModel,
)


def test_db_base_module_exists():
    """The shared SQLAlchemy declarative base must be importable."""
    assert Base is not None


def test_domain_tables_exist():
    """Phase 1 domain tables should be present in the DB model layer."""
    expected = {
        AgentProfileModel: "agent_profiles",
        WorkflowDefinitionModel: "workflow_definitions",
        MissionDefinitionModel: "mission_definitions",
        TriggerDefinitionModel: "trigger_definitions",
        RunModel: "runs",
        ArtifactModel: "artifacts",
    }

    for model, table_name in expected.items():
        assert hasattr(model, "__tablename__")
        assert model.__tablename__ == table_name


def test_domain_models_have_expected_fields():
    """Phase 1 domain models should expose the core contract fields."""
    assert hasattr(AgentProfileModel, "name")
    assert hasattr(AgentProfileModel, "slug")
    assert hasattr(AgentProfileModel, "role")
    assert hasattr(AgentProfileModel, "status")

    assert hasattr(WorkflowDefinitionModel, "entry_node")
    assert hasattr(WorkflowDefinitionModel, "state_schema")
    assert hasattr(WorkflowDefinitionModel, "nodes")
    assert hasattr(WorkflowDefinitionModel, "edges")
    assert hasattr(WorkflowDefinitionModel, "default_input_schema")
    assert hasattr(WorkflowDefinitionModel, "default_output_schema")

    assert hasattr(MissionDefinitionModel, "workflow_id")
    assert hasattr(MissionDefinitionModel, "default_profile_ids")
    assert hasattr(MissionDefinitionModel, "default_trigger_ids")
    assert hasattr(MissionDefinitionModel, "autonomy_mode")

    assert hasattr(TriggerDefinitionModel, "trigger_type")
    assert hasattr(TriggerDefinitionModel, "target_type")
    assert hasattr(TriggerDefinitionModel, "target_id")

    assert hasattr(RunModel, "run_type")
    assert hasattr(RunModel, "workspace_id")
    assert hasattr(RunModel, "state_snapshot")
    assert hasattr(RunModel, "input_payload")
    assert hasattr(RunModel, "output_payload")

    assert hasattr(ArtifactModel, "artifact_type")
    assert hasattr(ArtifactModel, "workspace_id")
    assert hasattr(ArtifactModel, "source_run_id")
    assert hasattr(ArtifactModel, "source_mission_id")
    assert hasattr(ArtifactModel, "title")


def test_domain_package_model_modules_are_importable():
    """Each Phase 1 domain package should expose an importable models module."""
    module_names = [
        "openforge.domains.profiles.models",
        "openforge.domains.workflows.models",
        "openforge.domains.missions.models",
        "openforge.domains.triggers.models",
        "openforge.domains.runs.models",
        "openforge.domains.artifacts.models",
        "openforge.domains.knowledge.models",
    ]

    for module_name in module_names:
        module = import_module(module_name)
        assert module is not None
