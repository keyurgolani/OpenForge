"""Tests for agent service."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from openforge.domains.agents.service import AgentService


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


class TestAgentService:
    def test_model_is_set(self):
        from openforge.db.models import AgentModel
        service = AgentService(AsyncMock())
        assert service.model is AgentModel

    @pytest.mark.asyncio
    async def test_get_agent_by_slug_not_found(self, mock_db):
        mock_db.scalar.return_value = None
        service = AgentService(mock_db)
        result = await service.get_agent_by_slug("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_agent_not_found(self, mock_db):
        mock_db.get.return_value = None
        service = AgentService(mock_db)
        result = await service.delete_agent(uuid4())
        assert result is False
