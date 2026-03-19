"""Tests for agent blueprint compiler."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from openforge.domains.agents.blueprint import AgentBlueprint, ModelConfig
from openforge.domains.agents.compiler import AgentBlueprintCompiler


@pytest.fixture
def mock_profile():
    """A mock AgentProfileModel with a real UUID id."""
    profile = MagicMock()
    profile.id = uuid4()
    profile.slug = "test-agent__compiled"
    return profile


@pytest.fixture
def mock_db(mock_profile):
    db = AsyncMock()
    # scalar calls: 1) existing spec check → None, 2) existing profile check → None,
    # 3) next version → None (max version)
    db.scalar = AsyncMock(return_value=None)
    db.execute = AsyncMock()
    db.add = MagicMock()
    # flush: simulate the profile getting an id after add+flush
    async def _flush():
        # After flush, any added profile gets its mock id
        pass
    db.flush = AsyncMock(side_effect=_flush)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    # Mock execute for workspace directory query
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute.return_value = mock_result

    # The compiler calls db.scalar 3 times:
    # 1) _find_existing_spec → None (no existing spec)
    # 2) _upsert_profile (select profile by slug) → None (create new)
    # 3) _next_version → None (no existing versions)
    # After creating profile via db.add + db.flush, it uses profile.id
    # We need add() to capture the profile and set its id
    original_add = db.add
    def _add_with_id(obj):
        if hasattr(obj, 'slug') and hasattr(obj, 'role') and not hasattr(obj, '_id_set'):
            obj.id = mock_profile.id
            obj._id_set = True
        original_add(obj)
    db.add = MagicMock(side_effect=_add_with_id)

    return db


@pytest.fixture
def sample_agent():
    agent = MagicMock()
    agent.id = uuid4()
    agent.slug = "test-agent"
    agent.blueprint_md = "test"
    agent.active_spec_id = None
    agent.profile_id = None
    agent.compilation_status = "pending"
    agent.compilation_error = None
    agent.last_compiled_at = None
    return agent


@pytest.fixture
def sample_blueprint():
    return AgentBlueprint(
        name="Test Agent",
        slug="test-agent",
        version="1.0.0",
        model=ModelConfig(default="gpt-4o", provider="openai"),
        system_prompt="You are a test agent.",
        constraints=["Be helpful"],
    )


class TestAgentBlueprintCompiler:
    @pytest.mark.asyncio
    async def test_compile_creates_spec(self, mock_db, sample_agent, sample_blueprint):
        """Compile should create a profile and spec."""
        # Setup: no existing spec, no existing profile
        mock_db.scalar.return_value = None

        compiler = AgentBlueprintCompiler(mock_db)
        spec = await compiler.compile(sample_agent, sample_blueprint, "abc123hash")

        assert spec.agent_id == sample_agent.id
        assert spec.agent_slug == "test-agent"
        assert spec.name == "Test Agent"
        assert spec.model_name == "gpt-4o"
        assert spec.provider_name == "openai"
        assert spec.system_prompt.startswith("You are a test agent.")
        assert "Be helpful" in spec.constraints
        assert mock_db.add.called
        assert mock_db.commit.called

    @pytest.mark.asyncio
    async def test_compile_sets_status_on_success(self, mock_db, sample_agent, sample_blueprint):
        mock_db.scalar.return_value = None
        compiler = AgentBlueprintCompiler(mock_db)
        await compiler.compile(sample_agent, sample_blueprint, "hash123")

        assert sample_agent.compilation_status == "success"
        assert sample_agent.compilation_error is None
        assert sample_agent.last_compiled_at is not None

    @pytest.mark.asyncio
    async def test_compile_sets_status_on_failure(self, mock_db, sample_agent, sample_blueprint):
        mock_db.scalar.return_value = None
        mock_db.flush.side_effect = Exception("DB error")

        compiler = AgentBlueprintCompiler(mock_db)
        with pytest.raises(Exception, match="DB error"):
            await compiler.compile(sample_agent, sample_blueprint, "hash123")

        assert sample_agent.compilation_status == "failed"
        assert "DB error" in sample_agent.compilation_error
