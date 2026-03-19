"""Tests for automation service."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from openforge.domains.automations.service import AutomationService


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


class TestAutomationService:
    def test_model_is_set(self):
        from openforge.db.models import AutomationModel
        service = AutomationService(AsyncMock())
        assert service.model is AutomationModel

    @pytest.mark.asyncio
    async def test_delete_automation_not_found(self, mock_db):
        mock_db.get.return_value = None
        service = AutomationService(mock_db)
        result = await service.delete_automation(uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_get_health_not_found(self, mock_db):
        mock_db.get.return_value = None
        service = AutomationService(mock_db)
        result = await service.get_health(uuid4())
        assert result is None
