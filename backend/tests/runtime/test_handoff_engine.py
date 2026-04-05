"""Tests for HandoffEngine."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.handoff_engine import HandoffEngine, handoff_engine


class TestHandoffEngine:
    def test_singleton_exists(self):
        assert isinstance(handoff_engine, HandoffEngine)

    @pytest.mark.asyncio
    async def test_transfer_conversation_not_found(self):
        engine = HandoffEngine()
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)

        result = await engine.transfer_to(
            db=mock_db,
            target_agent_slug="test-agent",
            conversation_id=uuid.uuid4(),
            messages=[],
        )
        assert result["transferred"] is False
        assert "not found" in result.get("error", "").lower()

    @pytest.mark.asyncio
    async def test_transfer_via_agent_registry(self):
        engine = HandoffEngine()
        mock_conversation = MagicMock()
        mock_conversation.subagent_agent_id = None

        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=mock_conversation)
        mock_db.commit = AsyncMock()

        with patch("openforge.runtime.handoff_engine.agent_registry") as mock_agent_reg:
            mock_agent_reg.resolve = AsyncMock(return_value=MagicMock())

            result = await engine.transfer_to(
                db=mock_db,
                target_agent_slug="test-agent",
                conversation_id=uuid.uuid4(),
                messages=[],
            )

        assert result["transferred"] is True
        assert result["target_agent"] == "test-agent"

    @pytest.mark.asyncio
    async def test_delegate_fallback_to_chat_handler(self):
        engine = HandoffEngine()
        mock_db = MagicMock()

        with patch("openforge.runtime.handoff_engine.agent_registry") as mock_agent_reg:
            mock_agent_reg.resolve = AsyncMock(return_value=None)

            with patch("openforge.runtime.chat_handler.chat_handler") as mock_chat:
                mock_chat.execute_subagent = AsyncMock(return_value={
                    "response": "delegated response",
                    "timeline": [],
                    "conversation_id": str(uuid.uuid4()),
                })

                result = await engine.delegate(
                    db=mock_db,
                    instruction="test task",
                    target_agent_slug="test-agent",
                )

        assert result["response"] == "delegated response"
