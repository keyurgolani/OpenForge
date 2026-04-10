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
    async def test_resolve_by_id_no_active_version(self):
        registry = AgentRegistry()
        mock_agent = MagicMock()
        mock_agent.id = uuid.uuid4()
        mock_agent.slug = "test"
        mock_agent.active_version_id = None

        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=mock_agent)

        result = await registry.resolve(mock_db, agent_id=mock_agent.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_by_id_builds_config(self):
        registry = AgentRegistry()
        agent_id = uuid.uuid4()

        mock_agent = MagicMock()
        mock_agent.id = agent_id
        mock_agent.slug = "test-agent"
        mock_agent.name = "Test Agent"
        mock_agent.active_version_id = uuid.uuid4()
        mock_agent.system_prompt = "You are a test agent."
        mock_agent.llm_config = {"provider": "openai", "model": "gpt-4"}
        mock_agent.tools_config = [{"name": "search", "category": "web"}]
        mock_agent.memory_config = {"history_limit": 10}
        mock_agent.parameters = []
        mock_agent.output_definitions = [{"key": "output", "type": "text"}]
        mock_agent.mode = "interactive"

        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=mock_agent)

        result = await registry.resolve(mock_db, agent_id=agent_id)
        assert result is not None
        assert result.agent_slug == "test-agent"
        assert result.name == "Test Agent"
        assert result.provider_name == "openai"
        assert result.model_name == "gpt-4"

        # Should be cached
        assert agent_id in registry._cache
        assert "test-agent" in registry._slug_cache

    @pytest.mark.asyncio
    async def test_list_available_agents(self):
        registry = AgentRegistry()

        agent_with_version = MagicMock()
        agent_with_version.id = uuid.uuid4()
        agent_with_version.slug = "active"
        agent_with_version.name = "Active"
        agent_with_version.description = "Has active version"
        agent_with_version.icon = None
        agent_with_version.active_version_id = uuid.uuid4()
        agent_with_version.mode = "interactive"

        class _Scalars:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return list(self._rows)

        class _Result:
            def __init__(self, rows):
                self._rows = rows

            def scalars(self):
                return _Scalars(self._rows)

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=_Result([agent_with_version]))

        agents = await registry.list_available_agents(mock_db)

        assert len(agents) == 1
        assert agents[0]["slug"] == "active"
        assert agents[0]["mode"] == "interactive"

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

    def test_module_level_singleton(self):
        from openforge.runtime.agent_registry import agent_registry
        assert isinstance(agent_registry, AgentRegistry)
