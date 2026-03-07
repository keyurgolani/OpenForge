"""Service facade for workspace knowledge operations."""

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
from openforge.services.knowledge_processing_service import (
    KnowledgeProcessingService,
    knowledge_processing_service,
)


class KnowledgeService:
    """Canonical knowledge service that delegates to the processing service."""

    def __init__(self, delegate: KnowledgeProcessingService) -> None:
        self._delegate = delegate

    async def create_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        data: KnowledgeCreate,
        background_tasks: BackgroundTasks,
    ) -> KnowledgeResponse:
        return await self._delegate.create_knowledge(db, workspace_id, data, background_tasks)

    async def list_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        params: KnowledgeListParams,
    ) -> tuple[list[KnowledgeListItem], int]:
        return await self._delegate.list_knowledge(db, workspace_id, params)

    async def get_knowledge(self, db: AsyncSession, workspace_id: UUID, knowledge_id: UUID) -> KnowledgeResponse:
        return await self._delegate.get_knowledge(db, workspace_id, knowledge_id)

    async def update_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        knowledge_id: UUID,
        data: KnowledgeUpdate,
        background_tasks: BackgroundTasks,
    ) -> KnowledgeResponse:
        return await self._delegate.update_knowledge(db, workspace_id, knowledge_id, data, background_tasks)

    async def delete_knowledge(self, db: AsyncSession, workspace_id: UUID, knowledge_id: UUID):
        return await self._delegate.delete_knowledge(db, workspace_id, knowledge_id)

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

    async def process_knowledge_background(
        self,
        *,
        knowledge_id: UUID,
        workspace_id: UUID,
        content: str,
        knowledge_type: str,
        title: str | None,
    ) -> None:
        await self._delegate._process_knowledge_background(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            content=content,
            knowledge_type=knowledge_type,
            title=title,
        )

    async def run_knowledge_intelligence_job(
        self,
        *,
        knowledge_id: UUID,
        workspace_id: UUID,
        audit_task_type: str | None = "generate_knowledge_intelligence",
    ) -> dict:
        return await self._delegate.run_knowledge_intelligence_job(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            audit_task_type=audit_task_type,
        )

    async def run_bookmark_content_extraction_job(
        self,
        *,
        knowledge_id: UUID,
        workspace_id: UUID,
        audit_task_type: str | None = "extract_bookmark_content",
        trigger_intelligence_after_extract: bool = False,
    ) -> bool:
        return await self._delegate.run_bookmark_content_extraction_job(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            audit_task_type=audit_task_type,
            trigger_intelligence_after_extract=trigger_intelligence_after_extract,
        )


knowledge_service = KnowledgeService(knowledge_processing_service)
