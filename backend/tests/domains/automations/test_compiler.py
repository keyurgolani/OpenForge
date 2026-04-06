"""Tests for automation blueprint compiler."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from openforge.domains.automations.blueprint import (
    AutomationBlueprint,
    AutomationNodeBlueprint,
)
from openforge.domains.automations.compiler import AutomationBlueprintCompiler


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.execute = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    db.get = AsyncMock(return_value=None)
    return db


@pytest.fixture
def sample_automation():
    auto = MagicMock()
    auto.id = uuid4()
    auto.slug = "test-automation"
    auto.name = "Test Automation"
    auto.description = None
    auto.agent_id = uuid4()
    auto.budget_config = {}
    auto.output_config = {}
    auto.tags = []
    auto.icon = None
    auto.active_spec_id = None
    auto.compilation_status = "pending"
    auto.compilation_error = None
    auto.last_compiled_at = None
    return auto


@pytest.fixture
def sample_agent():
    agent = MagicMock()
    agent.id = uuid4()
    agent.slug = "test-agent"
    agent.active_version_id = uuid4()
    return agent


@pytest.fixture
def sample_agent_spec():
    spec = MagicMock()
    spec.id = uuid4()
    spec.version = 1
    spec.snapshot = {"parameters": [], "output_definitions": [{"key": "output", "type": "text"}]}
    return spec


@pytest.fixture
def sample_blueprint():
    return AutomationBlueprint(
        name="Test Automation",
        slug="test-automation",
        agent_slug="test-agent",
        nodes=[
            AutomationNodeBlueprint(
                node_key="step1",
                node_type="agent",
                agent_slug="test-agent",
            ),
        ],
    )


class TestAutomationBlueprintCompiler:
    @pytest.mark.asyncio
    async def test_compile_fails_if_agent_has_no_spec(self, mock_db, sample_automation):
        agent = MagicMock()
        agent.slug = "no-spec-agent"
        agent.active_version_id = None

        # Blueprint has one node referencing the agent with no spec
        blueprint = AutomationBlueprint(
            name="Test Automation",
            slug="test-automation",
            nodes=[
                AutomationNodeBlueprint(
                    node_key="step1",
                    node_type="agent",
                    agent_slug="no-spec-agent",
                ),
            ],
        )

        # DB returns agent when queried by slug
        mock_db.scalar.return_value = agent

        compiler = AutomationBlueprintCompiler(mock_db)
        with pytest.raises(ValueError, match="has no compiled spec"):
            await compiler.compile(sample_automation, blueprint)

        assert sample_automation.compilation_status == "failed"

    @pytest.mark.asyncio
    async def test_compile_creates_spec(self, mock_db, sample_automation, sample_blueprint, sample_agent, sample_agent_spec):
        # scalar() is called multiple times: first for agent lookup, then for trigger lookup
        # We need it to return the agent for the first call, then None for subsequent calls
        mock_db.scalar.side_effect = [sample_agent, None, None]
        mock_db.get.return_value = sample_agent_spec

        compiler = AutomationBlueprintCompiler(mock_db)
        spec = await compiler.compile(sample_automation, sample_blueprint)

        assert spec.automation_id == sample_automation.id
        assert spec.is_multi_node is True
        assert len(spec.nodes) == 1
        assert spec.nodes[0].agent_id == sample_agent.id
        assert spec.nodes[0].agent_spec_id == sample_agent_spec.id
        assert sample_automation.compilation_status == "success"
