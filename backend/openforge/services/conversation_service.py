from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from uuid import UUID
from datetime import datetime, timezone, timedelta
import logging

from openforge.db.models import Conversation, Message
from openforge.schemas.conversation import (
    ConversationCreate, ConversationUpdate,
    ConversationResponse, ConversationWithMessages, MessageResponse
)
from openforge.services.config_service import config_service
from openforge.utils.chat_title import derive_chat_title
from fastapi import HTTPException

logger = logging.getLogger("openforge.conversation_service")
CHAT_TRASH_RETENTION_DAYS_KEY = "chat.trash_retention_days"
DEFAULT_CHAT_TRASH_RETENTION_DAYS = 30
MIN_CHAT_TRASH_RETENTION_DAYS = 1
MAX_CHAT_TRASH_RETENTION_DAYS = 365


def _msg_to_response(m: Message) -> MessageResponse:
    return MessageResponse(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role,
        content=m.content,
        thinking=m.thinking,
        model_used=m.model_used,
        provider_used=m.provider_used,
        token_count=m.token_count,
        generation_ms=m.generation_ms,
        context_sources=m.context_sources,
        created_at=m.created_at,
    )


def _conv_to_response(conv: Conversation, last_preview: str | None = None) -> ConversationResponse:
    return ConversationResponse(
        id=conv.id,
        workspace_id=conv.workspace_id,
        title=conv.title,
        title_locked=conv.title_locked,
        is_pinned=conv.is_pinned,
        is_archived=conv.is_archived,
        archived_at=conv.archived_at,
        message_count=conv.message_count,
        last_message_at=conv.last_message_at,
        last_message_preview=last_preview,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


class ConversationService:
    async def _get_chat_trash_retention_days(self, db: AsyncSession) -> int:
        raw = await config_service.get_config_raw(db, CHAT_TRASH_RETENTION_DAYS_KEY)
        try:
            value = int(raw)
        except (TypeError, ValueError):
            value = DEFAULT_CHAT_TRASH_RETENTION_DAYS
        return max(MIN_CHAT_TRASH_RETENTION_DAYS, min(MAX_CHAT_TRASH_RETENTION_DAYS, value))

    async def purge_expired_archived_conversations(
        self,
        db: AsyncSession,
        *,
        workspace_id: UUID | None = None,
    ) -> int:
        retention_days = await self._get_chat_trash_retention_days(db)
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        query = select(Conversation).where(
            Conversation.is_archived == True,  # noqa: E712
            or_(
                Conversation.archived_at <= cutoff,
                (Conversation.archived_at.is_(None) & (Conversation.updated_at <= cutoff)),
            ),
        )
        if workspace_id is not None:
            query = query.where(Conversation.workspace_id == workspace_id)

        result = await db.execute(query)
        stale = result.scalars().all()
        if not stale:
            return 0

        for conv in stale:
            await db.delete(conv)
        await db.commit()
        return len(stale)

    async def create_conversation(
        self, db: AsyncSession, workspace_id: UUID, data: ConversationCreate
    ) -> ConversationResponse:
        await self.purge_expired_archived_conversations(db, workspace_id=workspace_id)
        conv = Conversation(workspace_id=workspace_id, title=data.title, title_locked=False)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        return _conv_to_response(conv)

    async def list_conversations(
        self, db: AsyncSession, workspace_id: UUID, include_archived: bool = False
    ) -> list[ConversationResponse]:
        await self.purge_expired_archived_conversations(db, workspace_id=workspace_id)
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
        if conv.is_archived:
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
        if data.title_locked is not None:
            conv.title_locked = data.title_locked
        if data.is_pinned is not None:
            conv.is_pinned = data.is_pinned
        if data.is_archived is not None:
            conv.is_archived = data.is_archived
            conv.archived_at = datetime.now(timezone.utc) if data.is_archived else None
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(conv)
        return _conv_to_response(conv)

    async def delete_conversation(self, db: AsyncSession, workspace_id: UUID, conversation_id: UUID):
        await self.purge_expired_archived_conversations(db, workspace_id=workspace_id)
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.workspace_id == workspace_id,
            )
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conv.is_archived = True
        conv.archived_at = datetime.now(timezone.utc)
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()

    async def add_message(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        role: str,
        content: str,
        thinking: str | None = None,
        model_used: str | None = None,
        provider_used: str | None = None,
        token_count: int | None = None,
        generation_ms: int | None = None,
        context_sources: list | None = None,
        trigger_auto_title: bool = True,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            thinking=thinking,
            model_used=model_used,
            provider_used=provider_used,
            token_count=token_count,
            generation_ms=generation_ms,
            context_sources=context_sources,
        )
        db.add(msg)

        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count += 1
            conv.last_message_at = datetime.now(timezone.utc)
            conv.updated_at = datetime.now(timezone.utc)

            # Auto-generate title after each assistant reply unless manually locked.
            if trigger_auto_title and role == "assistant" and not conv.title_locked:
                import asyncio
                asyncio.create_task(
                    self._auto_title(conv.workspace_id, conversation_id)
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

    async def refresh_conversation_title(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        conversation_id: UUID,
        *,
        provider_name: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> str | None:
        from openforge.core.llm_gateway import llm_gateway
        from openforge.services.llm_service import llm_service
        from openforge.api.websocket import ws_manager

        conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = conv_result.scalar_one_or_none()
        if not conv or conv.title_locked:
            return None

        msgs_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        all_messages = msgs_result.scalars().all()
        if not all_messages:
            return None

        window = all_messages[-18:]
        first_user_text = next(
            ((m.content or "").strip() for m in all_messages if m.role == "user" and (m.content or "").strip()),
            "",
        )
        transcript_lines: list[str] = []
        for message in window:
            role_label = "User" if message.role == "user" else "Assistant"
            text = (message.content or "").strip()
            if not text:
                continue
            if len(text) > 320:
                text = f"{text[:320]}..."
            transcript_lines.append(f"{role_label}: {text}")

        transcript = "\n".join(transcript_lines).strip()
        if not transcript:
            return None

        selected_provider_name = provider_name
        selected_api_key = api_key
        selected_model = model
        selected_base_url = base_url
        raw_title = ""
        try:
            if not selected_provider_name or not selected_model:
                selected_provider_name, selected_api_key, selected_model, selected_base_url = await llm_service.get_provider_for_workspace(
                    db, workspace_id
                )

            raw_title = await llm_gateway.chat(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Generate a concise conversation title from this full conversation so far. "
                            "Return ONLY title text.\n\n"
                            f"Conversation:\n{transcript[:5000]}"
                        ),
                    }
                ],
                provider_name=selected_provider_name,
                api_key=selected_api_key or "",
                model=selected_model,
                base_url=selected_base_url,
                max_tokens=20,
            )
        except Exception as e:
            logger.warning(
                "Conversation title generation failed for %s, using fallback: %s",
                conversation_id,
                e,
            )

        title = derive_chat_title(raw_title, first_user_text or transcript)
        if not title:
            return None

        # Re-check lock status before write in case user updated concurrently.
        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if not conv or conv.title_locked:
            return None

        next_title = title[:500]
        if conv.title == next_title:
            return next_title

        conv.title = next_title
        await db.commit()
        await ws_manager.send_to_workspace(
            str(workspace_id),
            {
                "type": "conversation_updated",
                "conversation_id": str(conversation_id),
                "fields": ["title"],
            },
        )
        return next_title

    async def _auto_title(self, workspace_id: UUID, conversation_id: UUID):
        try:
            from openforge.db.postgres import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                await self.refresh_conversation_title(db, workspace_id, conversation_id)
        except Exception as e:
            logger.warning(f"Auto-title generation failed: {e}")


conversation_service = ConversationService()
