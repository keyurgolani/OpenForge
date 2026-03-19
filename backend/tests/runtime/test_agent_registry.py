"""Tests for AgentRegistry."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.agent_registry import AgentRegistry


class TestAgentRegistry:
    def test_initial_state(self):
        registry = AgentRegistry()
        assert registry._cache == {}
        assert registry._slug_cache == {}

    @pytest.mark.asyncio
    async def test_resolve_by_id_not_found(self):
        registry = AgentRegistry()
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)

        result = await registry.resolve(mock_db, agent_id=uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_by_id_no_active_spec(self):
        registry = AgentRegistry()
        mock_agent = MagicMock()
        mock_agent.id = uuid.uuid4()
        mock_agent.slug = "test"
        mock_agent.active_spec_id = None

        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=mock_agent)

        result = await registry.resolve(mock_db, agent_id=mock_agent.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_by_id_with_spec(self):
        registry = AgentRegistry()
        agent_id = uuid.uuid4()
        spec_id = uuid.uuid4()

        mock_agent = MagicMock()
        mock_agent.id = agent_id
        mock_agent.slug = "test-agent"
        mock_agent.active_spec_id = spec_id

        mock_spec = MagicMock()
        mock_spec.resolved_config = {
            "agent_id": str(agent_id),
            "agent_slug": "test-agent",
            "name": "Test Agent",
            "version": "1.0.0",
            "profile_id": str(uuid.uuid4()),
            "strategy": "chat",
        }

        mock_db = MagicMock()

        async def fake_get(model_cls, obj_id):
            if obj_id == agent_id:
                return mock_agent
            if obj_id == spec_id:
                return mock_spec
            return None

        mock_db.get = AsyncMock(side_effect=fake_get)

        result = await registry.resolve(mock_db, agent_id=agent_id)
        assert result is not None
        assert result.agent_slug == "test-agent"

        # Should be cached
        assert agent_id in registry._cache
        assert "test-agent" in registry._slug_cache

    @pytest.mark.asyncio
    async def test_cache_hit(self):
        registry = AgentRegistry()
        agent_id = uuid.uuid4()
        mock_spec = MagicMock()
        registry._cache[agent_id] = mock_spec

        mock_db = MagicMock()
        result = await registry.resolve(mock_db, agent_id=agent_id)
        assert result is mock_spec
        mock_db.get.assert_not_called()

    def test_invalidate(self):
        registry = AgentRegistry()
        agent_id = uuid.uuid4()
        registry._cache[agent_id] = MagicMock()
        registry._slug_cache["test"] = agent_id

        registry.invalidate(agent_id)
        assert agent_id not in registry._cache
        assert "test" not in registry._slug_cache

    def test_clear_cache(self):
        registry = AgentRegistry()
        registry._cache[uuid.uuid4()] = MagicMock()
        registry._slug_cache["test"] = uuid.uuid4()

        registry.clear_cache()
        assert len(registry._cache) == 0
        assert len(registry._slug_cache) == 0

    @pytest.mark.asyncio
    async def test_resolve_for_workspace_no_default(self):
        registry = AgentRegistry()
        mock_workspace = MagicMock()
        mock_workspace.default_agent_id = None

        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=mock_workspace)

        result = await registry.resolve_for_workspace(mock_db, uuid.uuid4())
        assert result is None

    def test_module_level_singleton(self):
        from openforge.runtime.agent_registry import agent_registry
        assert isinstance(agent_registry, AgentRegistry)
