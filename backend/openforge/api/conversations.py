from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
from openforge.db.postgres import get_db
from openforge.services.conversation_service import conversation_service
from openforge.schemas.conversation import (
    ConversationCreate, ConversationUpdate,
    ConversationResponse, ConversationWithMessages
)

router = APIRouter()


@router.get("/{workspace_id}/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    workspace_id: UUID,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
):
    return await conversation_service.list_conversations(db, workspace_id, include_archived)


@router.post("/{workspace_id}/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    workspace_id: UUID, body: ConversationCreate, db: AsyncSession = Depends(get_db)
):
    return await conversation_service.create_conversation(db, workspace_id, body)


@router.get("/{workspace_id}/conversations/{conversation_id}", response_model=ConversationWithMessages)
async def get_conversation(
    workspace_id: UUID,
    conversation_id: UUID,
    limit: int = 50,
    before_id: Optional[UUID] = None,
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await conversation_service.get_conversation_with_messages(
        db,
        conversation_id,
        limit,
        before_id,
        workspace_id=workspace_id,
        include_archived=include_archived,
    )


@router.put("/{workspace_id}/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    workspace_id: UUID,
    conversation_id: UUID,
    body: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await conversation_service.update_conversation(db, conversation_id, body)


@router.delete("/{workspace_id}/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    workspace_id: UUID, conversation_id: UUID, db: AsyncSession = Depends(get_db)
):
    await conversation_service.delete_conversation(db, workspace_id, conversation_id)


@router.delete("/{workspace_id}/conversations/{conversation_id}/permanent", status_code=204)
async def permanently_delete_conversation(
    workspace_id: UUID,
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    await conversation_service.permanently_delete_conversation(db, workspace_id, conversation_id)
