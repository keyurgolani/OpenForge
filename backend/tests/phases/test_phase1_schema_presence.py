"""
Phase 1 Schema Presence Tests

Tests to verify new tables/models exist for profiles, workflows, missions, triggers, runs, artifacts.
"""

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.base import Base
from openforge.db.models import (
    AgentProfileModel,
    WorkflowDefinitionModel
    MissionDefinitionModel
    TriggerDefinitionModel
    RunModel
    ArtifactModel
)


def test_domain_tables_exist():
    """Test that all Phase 1 domain tables exist."""
    # Check that models are registered with SQLAlchemy
    assert hasattr(AgentProfileModel, '__tablename__')
    assert AgentProfileModel.__tablename__ == "agent_profiles"

    assert hasattr(WorkflowDefinitionModel, '__tablename__')
    assert WorkflowDefinitionModel.__tablename__ == "workflow_definitions"

    assert hasattr(MissionDefinitionModel, '__tablename__')
    assert MissionDefinitionModel.__tablename__ == "mission_definitions"

    assert hasattr(TriggerDefinitionModel, '__tablename__')
    assert TriggerDefinitionModel.__tablename__ == "trigger_definitions"

    assert hasattr(RunModel, '__tablename__')
    assert RunModel.__tablename__ == "runs"

    assert hasattr(ArtifactModel, '__tablename__')
    assert ArtifactModel.__tablename__ == "artifacts"


def test_domain_models_have_correct_columns():
    """Test that domain models have the expected columns."""
    # Profile
    assert hasattr(AgentProfileModel, 'id')
    assert hasattr(AgentProfileModel, 'name')
    assert hasattr(AgentProfileModel, 'slug')
    assert hasattr(AgentProfileModel, 'role')
    assert hasattr(AgentProfileModel, 'status')

    # Workflow
    assert hasattr(WorkflowDefinitionModel, 'id')
    assert hasattr(WorkflowDefinitionModel, 'name')
    assert hasattr(WorkflowDefinitionModel, 'slug')
    assert hasattr(WorkflowDefinitionModel, 'nodes')
    assert hasattr(WorkflowDefinitionModel, 'edges')
    assert hasattr(WorkflowDefinitionModel, 'status')

    # Mission
    assert hasattr(MissionDefinitionModel, 'id')
    assert hasattr(MissionDefinitionModel, 'name')
    assert hasattr(MissionDefinitionModel, 'slug')
    assert hasattr(MissionDefinitionModel, 'workflow_id')
    assert hasattr(MissionDefinitionModel, 'status')

    # Trigger
    assert hasattr(TriggerDefinitionModel, 'id')
    assert hasattr(TriggerDefinitionModel, 'name')
    assert hasattr(TriggerDefinitionModel, 'trigger_type')
    assert hasattr(TriggerDefinitionModel, 'target_id')
    assert hasattr(TriggerDefinitionModel, 'status')

    # Run
    assert hasattr(RunModel, 'id')
    assert hasattr(RunModel, 'run_type')
    assert hasattr(RunModel, 'workspace_id')
    assert hasattr(RunModel, 'status')
    assert hasattr(RunModel, 'input_payload')
    assert hasattr(RunModel, 'output_payload')

    # Artifact
    assert hasattr(ArtifactModel, 'id')
    assert hasattr(ArtifactModel, 'artifact_type')
    assert hasattr(ArtifactModel, 'workspace_id')
    assert hasattr(ArtifactModel, 'title')
    assert hasattr(ArtifactModel, 'status')
