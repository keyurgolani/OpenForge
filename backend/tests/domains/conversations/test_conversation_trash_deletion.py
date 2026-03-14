from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from openforge.services.conversation_service import conversation_service


class _FakeResult:
    def __init__(self, *, scalar=None):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


class _FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.commit_count = 0
        self.deleted: list[object] = []

    async def execute(self, _query):
        if not self._results:
            raise AssertionError("No fake results left for execute()")
        return self._results.pop(0)

    async def delete(self, item):
        self.deleted.append(item)

    async def commit(self):
        self.commit_count += 1


@pytest.mark.asyncio
async def test_permanently_delete_conversation_deletes_archived_chat(monkeypatch):
    workspace_id = uuid4()
    conversation_id = uuid4()
    conv = SimpleNamespace(
        id=conversation_id,
        workspace_id=workspace_id,
        is_archived=True,
    )
    db = _FakeDB([_FakeResult(scalar=conv)])

    async def _fake_purge(*_args, **_kwargs):
        return 0

    monkeypatch.setattr(
        conversation_service,
        "purge_expired_archived_conversations",
        _fake_purge,
    )

    await conversation_service.permanently_delete_conversation(db, workspace_id, conversation_id)

    assert db.deleted == [conv]
    assert db.commit_count == 1


@pytest.mark.asyncio
async def test_permanently_delete_conversation_rejects_active_chat(monkeypatch):
    workspace_id = uuid4()
    conversation_id = uuid4()
    conv = SimpleNamespace(
        id=conversation_id,
        workspace_id=workspace_id,
        is_archived=False,
    )
    db = _FakeDB([_FakeResult(scalar=conv)])

    async def _fake_purge(*_args, **_kwargs):
        return 0

    monkeypatch.setattr(
        conversation_service,
        "purge_expired_archived_conversations",
        _fake_purge,
    )

    with pytest.raises(HTTPException) as exc_info:
        await conversation_service.permanently_delete_conversation(db, workspace_id, conversation_id)

    assert exc_info.value.status_code == 400
    assert db.deleted == []
    assert db.commit_count == 0

