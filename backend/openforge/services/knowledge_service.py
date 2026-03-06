"""Knowledge naming layer over the legacy note service implementation."""

from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from fastapi import BackgroundTasks

from openforge.schemas.knowledge import (
    KnowledgeCreate,
    KnowledgeUpdate,
    KnowledgeResponse,
    KnowledgeListItem,
    KnowledgeListParams,
)
from openforge.services.note_service import NoteService as _NoteService, note_service


class KnowledgeService:
    """Knowledge-first facade that delegates to the existing note service."""

    def __init__(self, delegate: _NoteService) -> None:
        self._delegate = delegate

    async def create_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        data: KnowledgeCreate,
        background_tasks: BackgroundTasks,
    ) -> KnowledgeResponse:
        return await self._delegate.create_note(db, workspace_id, data, background_tasks)

    async def list_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        params: KnowledgeListParams,
    ) -> tuple[list[KnowledgeListItem], int]:
        return await self._delegate.list_notes(db, workspace_id, params)

    async def get_knowledge(self, db: AsyncSession, workspace_id: UUID, knowledge_id: UUID) -> KnowledgeResponse:
        return await self._delegate.get_note(db, workspace_id, knowledge_id)

    async def update_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        knowledge_id: UUID,
        data: KnowledgeUpdate,
        background_tasks: BackgroundTasks,
    ) -> KnowledgeResponse:
        return await self._delegate.update_note(db, workspace_id, knowledge_id, data, background_tasks)

    async def delete_knowledge(self, db: AsyncSession, workspace_id: UUID, knowledge_id: UUID):
        return await self._delegate.delete_note(db, workspace_id, knowledge_id)

    async def update_tags(
        self,
        db: AsyncSession,
        knowledge_id: UUID,
        tags: list[str],
        source: str = "user",
    ) -> KnowledgeResponse:
        return await self._delegate.update_tags(db, knowledge_id, tags, source=source)

    async def toggle_pin(self, db: AsyncSession, knowledge_id: UUID) -> KnowledgeResponse:
        return await self._delegate.toggle_pin(db, knowledge_id)

    async def toggle_archive(self, db: AsyncSession, knowledge_id: UUID) -> KnowledgeResponse:
        return await self._delegate.toggle_archive(db, knowledge_id)


knowledge_service = KnowledgeService(note_service)

# Backward compatibility exports
NoteService = _NoteService
