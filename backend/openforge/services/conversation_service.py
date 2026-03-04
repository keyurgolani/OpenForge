from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from datetime import datetime, timezone
import logging

from openforge.db.models import Conversation, Message
from openforge.schemas.conversation import (
    ConversationCreate, ConversationUpdate,
    ConversationResponse, ConversationWithMessages, MessageResponse
)
from fastapi import HTTPException

logger = logging.getLogger("openforge.conversation_service")


def _msg_to_response(m: Message) -> MessageResponse:
    return MessageResponse(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role,
        content=m.content,
        model_used=m.model_used,
        provider_used=m.provider_used,
        token_count=m.token_count,
        context_sources=m.context_sources,
        created_at=m.created_at,
    )


def _conv_to_response(conv: Conversation, last_preview: str | None = None) -> ConversationResponse:
    return ConversationResponse(
        id=conv.id,
        workspace_id=conv.workspace_id,
        title=conv.title,
        is_pinned=conv.is_pinned,
        is_archived=conv.is_archived,
        message_count=conv.message_count,
        last_message_at=conv.last_message_at,
        last_message_preview=last_preview,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


class ConversationService:
    async def create_conversation(
        self, db: AsyncSession, workspace_id: UUID, data: ConversationCreate
    ) -> ConversationResponse:
        conv = Conversation(workspace_id=workspace_id, title=data.title)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        return _conv_to_response(conv)

    async def list_conversations(
        self, db: AsyncSession, workspace_id: UUID, include_archived: bool = False
    ) -> list[ConversationResponse]:
        query = select(Conversation).where(Conversation.workspace_id == workspace_id)
        if not include_archived:
            query = query.where(Conversation.is_archived == False)
        query = query.order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
        result = await db.execute(query)
        convs = result.scalars().all()
        return [_conv_to_response(c) for c in convs]

    async def get_conversation_with_messages(
        self, db: AsyncSession, conversation_id: UUID, limit: int = 50, before_id: UUID | None = None
    ) -> ConversationWithMessages:
        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        msg_query = select(Message).where(Message.conversation_id == conversation_id)
        if before_id:
            before_result = await db.execute(select(Message).where(Message.id == before_id))
            before_msg = before_result.scalar_one_or_none()
            if before_msg:
                msg_query = msg_query.where(Message.created_at < before_msg.created_at)
        msg_query = msg_query.order_by(Message.created_at.asc()).limit(limit)
        msg_result = await db.execute(msg_query)
        messages = [_msg_to_response(m) for m in msg_result.scalars().all()]

        response = ConversationWithMessages(**_conv_to_response(conv).__dict__)
        response.messages = messages
        return response

    async def update_conversation(
        self, db: AsyncSession, conversation_id: UUID, data: ConversationUpdate
    ) -> ConversationResponse:
        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if data.title is not None:
            conv.title = data.title
        if data.is_pinned is not None:
            conv.is_pinned = data.is_pinned
        if data.is_archived is not None:
            conv.is_archived = data.is_archived
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(conv)
        return _conv_to_response(conv)

    async def delete_conversation(self, db: AsyncSession, conversation_id: UUID):
        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        await db.delete(conv)
        await db.commit()

    async def add_message(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        role: str,
        content: str,
        model_used: str | None = None,
        provider_used: str | None = None,
        token_count: int | None = None,
        context_sources: list | None = None,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            model_used=model_used,
            provider_used=provider_used,
            token_count=token_count,
            context_sources=context_sources,
        )
        db.add(msg)

        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count += 1
            conv.last_message_at = datetime.now(timezone.utc)
            conv.updated_at = datetime.now(timezone.utc)

            # Auto-generate title on first assistant message
            if role == "assistant" and conv.title is None and conv.message_count <= 2:
                from openforge.db.postgres import AsyncSessionLocal
                from openforge.core.llm_gateway import llm_gateway
                first_msg_r = await db.execute(
                    select(Message).where(
                        Message.conversation_id == conversation_id,
                        Message.role == "user"
                    ).order_by(Message.created_at.asc()).limit(1)
                )
                first_msg = first_msg_r.scalar_one_or_none()
                if first_msg:
                    import asyncio
                    asyncio.create_task(
                        self._auto_title(conv.workspace_id, conversation_id, first_msg.content)
                    )

        await db.commit()
        await db.refresh(msg)
        return msg

    async def get_recent_messages(
        self, db: AsyncSession, conversation_id: UUID, limit: int = 20
    ) -> list[dict]:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = result.scalars().all()
        return [{"role": m.role, "content": m.content} for m in reversed(messages)]

    async def _auto_title(self, workspace_id: UUID, conversation_id: UUID, first_message: str):
        try:
            from openforge.db.postgres import AsyncSessionLocal
            from openforge.core.llm_gateway import llm_gateway
            from openforge.services.llm_service import llm_service

            async with AsyncSessionLocal() as db:
                provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
                title = await llm_gateway.chat(
                    messages=[
                        {"role": "user", "content": f"Generate a concise 5-word title for a conversation that starts with: {first_message[:300]}. Return ONLY the title."}
                    ],
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                    max_tokens=20,
                )
                result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
                conv = result.scalar_one_or_none()
                if conv and not conv.title:
                    conv.title = title.strip()[:500]
                    await db.commit()
        except Exception as e:
            logger.warning(f"Auto-title generation failed: {e}")


conversation_service = ConversationService()
