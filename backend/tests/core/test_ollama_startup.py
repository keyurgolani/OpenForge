"""Tests for the unified OpenForge Local provider seeding via ensure_local_provider()."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.services.local_models import (
    LOCAL_PROVIDER_ID,
    LOCAL_PROVIDER_NAME,
    ensure_local_provider,
)


@pytest.mark.asyncio
async def test_creates_unified_provider_when_none_exists():
    """When no openforge-local provider exists, ensure_local_provider creates one."""
    from openforge.db.models import LLMProvider

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    added_objects: list = []
    mock_db.add = lambda obj: added_objects.append(obj)

    mock_settings = MagicMock(ollama_url="http://ollama:11434")
    with patch("openforge.services.local_models.get_settings", return_value=mock_settings):
        await ensure_local_provider(mock_db)

    assert len(added_objects) == 1
    provider = added_objects[0]
    assert provider.provider_name == LOCAL_PROVIDER_NAME
    assert provider.display_name == "OpenForge Local"
    assert provider.endpoint_id == "local"
    assert provider.base_url == "http://ollama:11434"
    assert provider.is_system is True
    assert provider.is_system_default is False
    assert provider.id == LOCAL_PROVIDER_ID
    mock_db.flush.assert_awaited_once()
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_updates_base_url_when_provider_exists_with_stale_url():
    """When the provider exists but base_url differs from settings, it gets updated."""
    from openforge.db.models import LLMProvider

    existing = MagicMock(spec=LLMProvider)
    existing.provider_name = LOCAL_PROVIDER_NAME
    existing.is_system = True
    existing.base_url = "http://old-ollama:11434"

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    mock_settings = MagicMock(ollama_url="http://ollama:11434")
    with patch("openforge.services.local_models.get_settings", return_value=mock_settings):
        await ensure_local_provider(mock_db)

    assert existing.base_url == "http://ollama:11434"
    mock_db.flush.assert_awaited_once()
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sets_is_system_flag_when_missing():
    """When the provider exists but is_system is False, it gets corrected."""
    from openforge.db.models import LLMProvider

    existing = MagicMock(spec=LLMProvider)
    existing.provider_name = LOCAL_PROVIDER_NAME
    existing.is_system = False
    existing.base_url = "http://ollama:11434"

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    mock_settings = MagicMock(ollama_url="http://ollama:11434")
    with patch("openforge.services.local_models.get_settings", return_value=mock_settings):
        await ensure_local_provider(mock_db)

    assert existing.is_system is True


@pytest.mark.asyncio
async def test_no_update_when_provider_already_correct():
    """When the provider exists with correct base_url and is_system, no changes needed."""
    from openforge.db.models import LLMProvider

    existing = MagicMock(spec=LLMProvider)
    existing.provider_name = LOCAL_PROVIDER_NAME
    existing.is_system = True
    existing.base_url = "http://ollama:11434"

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    mock_settings = MagicMock(ollama_url="http://ollama:11434")
    with patch("openforge.services.local_models.get_settings", return_value=mock_settings):
        await ensure_local_provider(mock_db)

    # base_url should remain unchanged
    assert existing.base_url == "http://ollama:11434"
    mock_db.flush.assert_awaited_once()
    mock_db.commit.assert_awaited_once()
