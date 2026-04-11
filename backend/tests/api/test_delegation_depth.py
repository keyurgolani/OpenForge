"""Tests for delegation depth limit enforcement."""

from __future__ import annotations

import pytest

from openforge.api.runtime import MAX_DELEGATION_DEPTH, DelegationRequest


class TestDelegationDepthLimit:
    """Verify the delegation depth limit prevents runaway subagent chains."""

    def test_max_delegation_depth_is_positive(self):
        assert MAX_DELEGATION_DEPTH > 0

    def test_request_within_depth_limit_is_valid(self):
        """A request with call_id_path shorter than MAX is accepted by the model."""
        req = DelegationRequest(
            instruction="Do something",
            call_id_path=["a"] * (MAX_DELEGATION_DEPTH - 1),
        )
        assert len(req.call_id_path) < MAX_DELEGATION_DEPTH

    def test_request_at_depth_limit_is_constructed(self):
        """A request exactly at the limit can be constructed (rejected by endpoint)."""
        req = DelegationRequest(
            instruction="Do something",
            call_id_path=["a"] * MAX_DELEGATION_DEPTH,
        )
        assert len(req.call_id_path) == MAX_DELEGATION_DEPTH

    def test_none_call_id_path_treated_as_depth_zero(self):
        """When call_id_path is None, current depth is 0."""
        req = DelegationRequest(instruction="Do something")
        assert req.call_id_path is None
        depth = len(req.call_id_path) if req.call_id_path else 0
        assert depth == 0

    @pytest.mark.asyncio
    async def test_invoke_rejects_at_max_depth(self):
        """The invoke endpoint returns 422 when delegation depth is exhausted."""
        from unittest.mock import AsyncMock, MagicMock
        from fastapi import HTTPException
        from openforge.api.runtime import invoke_delegation

        req = DelegationRequest(
            instruction="Do something",
            call_id_path=["call-1", "call-2", "call-3", "call-4", "call-5"],
        )
        assert len(req.call_id_path) >= MAX_DELEGATION_DEPTH

        db = MagicMock()
        with pytest.raises(HTTPException) as exc_info:
            await invoke_delegation(req, db=db)

        assert exc_info.value.status_code == 422
        assert "depth limit" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_invoke_allows_below_max_depth(self):
        """The invoke endpoint proceeds (doesn't raise 422) when under the limit."""
        from unittest.mock import AsyncMock, MagicMock, patch
        from openforge.api.runtime import invoke_delegation

        req = DelegationRequest(
            instruction="Do something",
            call_id_path=["call-1"],
        )
        assert len(req.call_id_path) < MAX_DELEGATION_DEPTH

        db = MagicMock()
        with patch("openforge.api.runtime.chat_handler") as mock_handler:
            mock_handler.execute_subagent = AsyncMock(return_value={
                "response": "done",
                "timeline": [],
                "conversation_id": "abc",
                "output_definitions": [],
            })
            result = await invoke_delegation(req, db=db)
            assert result.response == "done"
            mock_handler.execute_subagent.assert_awaited_once()
