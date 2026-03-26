from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone, timedelta
import logging

from openforge.db.models import Conversation, Message, MessageAttachment
from openforge.schemas.conversation import (
    ConversationCreate, ConversationUpdate,
    ConversationResponse, ConversationWithMessages, MessageResponse
)
from openforge.services.config_service import config_service
from openforge.services.attachment_pipeline import resolve_attachment_pipeline, get_extractor
from openforge.common.text import (
    build_running_title_summary,
    derive_chat_title,
    has_chat_topic_shift,
    is_low_signal_chat_turn,
    pick_weighted_title_seed_from_messages,
)
from fastapi import HTTPException

logger = logging.getLogger("openforge.conversation_service")
CHAT_TRASH_RETENTION_DAYS_KEY = "chat.trash_retention_days"
DEFAULT_CHAT_TRASH_RETENTION_DAYS = 30
MIN_CHAT_TRASH_RETENTION_DAYS = 1
MAX_CHAT_TRASH_RETENTION_DAYS = 365


def _attachment_to_processed_summary(attachment: MessageAttachment) -> dict:
    source_url = getattr(attachment, "source_url", None)

    # URL-extracted attachments have a synthetic pipeline type
    if source_url or attachment.content_type == "text/url-extract":
        extracted_text = (attachment.extracted_text or "").strip()
        return {
            "id": str(attachment.id),
            "filename": attachment.filename,
            "status": "processed" if extracted_text else "empty",
            "pipeline": "url_extract",
            "details": f"Extracted {len(extracted_text)} chars" if extracted_text else "No content extracted",
            "source_url": source_url,
            "extracted_text": extracted_text[:5000] if extracted_text else None,
        }

    extractor = get_extractor(
        content_type=attachment.content_type,
        filename=attachment.filename,
    )
    pipeline = extractor.pipeline if extractor is not None else resolve_attachment_pipeline(
        content_type=attachment.content_type,
        filename=attachment.filename,
    )
    extracted_text = (attachment.extracted_text or "").strip()

    if extractor is None:
        status = "deferred"
        details = "Pipeline not available yet for this file type"
    elif extracted_text:
        status = "processed"
        details = f"Extracted text ({len(extracted_text)} chars)"
    else:
        status = "empty"
        details = "No text extracted from attachment"

    return {
        "id": str(attachment.id),
        "filename": attachment.filename,
        "status": status,
        "pipeline": pipeline,
        "details": details,
        "source_url": None,
        "extracted_text": extracted_text[:5000] if extracted_text else None,
    }


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
        attachments_processed=[_attachment_to_processed_summary(att) for att in (m.attachments or [])],
        tool_calls=m.tool_calls,
        timeline=m.timeline,
        is_interrupted=m.is_interrupted,
        provider_metadata=m.provider_metadata,
        created_at=m.created_at,
    )


def _conv_to_response(conv: Conversation, last_preview: str | None = None) -> ConversationResponse:
    agent_name = None
    if conv.agent_id:
        try:
            agent_name = conv.agent.name if conv.agent else None
        except Exception:
            pass
    return ConversationResponse(
        id=conv.id,
        workspace_id=conv.workspace_id,
        title=conv.title,
        title_locked=conv.title_locked,
        is_pinned=conv.is_pinned,
        is_archived=conv.is_archived,
        archived_at=conv.archived_at,
        is_delegated=conv.is_subagent,
        delegated_profile_id=conv.subagent_agent_id,
        agent_id=conv.agent_id,
        agent_name=agent_name,
        message_count=conv.message_count,
        last_message_at=conv.last_message_at,
        last_message_preview=last_preview,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


class ConversationService:
    @staticmethod
    def _preferred_title_model(provider_name: str | None, fallback_model: str | None) -> str:
        provider = (provider_name or "").strip().lower()
        fallback = (fallback_model or "").strip()
        if provider in {"ollama", "custom-openai", "custom-anthropic"}:
            return fallback
        model_map = {
            "openai": "gpt-4o-mini",
            "anthropic": "claude-3-5-haiku-latest",
            "gemini": "gemini-2.0-flash",
            "groq": "llama-3.1-8b-instant",
            "openrouter": "openai/gpt-4o-mini",
            "deepseek": "deepseek-chat",
            "mistral": "ministral-8b-latest",
            "xai": "grok-2-mini",
            "cohere": "command-r7b-12-2024",
            "zhipuai": "glm-4-air",
        }
        return model_map.get(provider, fallback)

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
        self,
        db: AsyncSession,
        workspace_id: UUID,
        include_archived: bool = False,
        category: str = "chats",
    ) -> list[ConversationResponse]:
        await self.purge_expired_archived_conversations(db, workspace_id=workspace_id)
        query = select(Conversation).where(Conversation.workspace_id == workspace_id)
        if category == "delegated":
            query = query.where(
                Conversation.is_subagent == True,  # noqa: E712
                Conversation.is_archived == False,  # noqa: E712
                or_(
                    Conversation.subagent_agent_id.is_(None),
                    Conversation.subagent_agent_id == "workspace_agent",
                ),
            )
        elif category == "trash":
            query = query.where(Conversation.is_archived == True)  # noqa: E712
        elif include_archived:
            pass  # return everything
        else:
            # Default "chats": active non-delegated conversations
            query = query.where(Conversation.is_subagent == False, Conversation.is_archived == False)  # noqa: E712
        query = query.order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
        result = await db.execute(query)
        convs = result.scalars().all()
        return [_conv_to_response(c) for c in convs]

    async def get_conversation_with_messages(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        limit: int = 50,
        before_id: UUID | None = None,
        *,
        workspace_id: UUID | None = None,
        include_archived: bool = False,
    ) -> ConversationWithMessages:
        query = select(Conversation).where(Conversation.id == conversation_id)
        if workspace_id is not None:
            query = query.where(Conversation.workspace_id == workspace_id)
        result = await db.execute(query)
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv.is_archived and not include_archived:
            raise HTTPException(status_code=404, detail="Conversation not found")

        msg_query = (
            select(Message)
            .options(selectinload(Message.attachments))
            .where(Message.conversation_id == conversation_id)
        )
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
            # Manual title edits lock the conversation title by default unless
            # the caller explicitly overrides lock state in the same request.
            if data.title_locked is None:
                conv.title_locked = True
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

    async def permanently_delete_conversation(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        conversation_id: UUID,
    ):
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
        if not conv.is_archived:
            raise HTTPException(
                status_code=400,
                detail="Only chats in Trash can be permanently deleted",
            )
        await db.delete(conv)
        await db.commit()
        # Remove chat embeddings from Qdrant so deleted conversations no
        # longer surface as RAG context in future chats.
        try:
            from openforge.common.config import get_settings
            from openforge.db.qdrant_client import get_qdrant
            from qdrant_client import models as qdrant_models
            client = get_qdrant()
            settings = get_settings()
            client.delete(
                collection_name=settings.qdrant_collection,
                points_selector=qdrant_models.FilterSelector(
                    filter=qdrant_models.Filter(
                        must=[
                            qdrant_models.FieldCondition(
                                key="conversation_id",
                                match=qdrant_models.MatchValue(value=str(conversation_id)),
                            )
                        ]
                    )
                ),
            )
        except Exception as e:
            logger.warning("Failed to delete Qdrant chat embeddings for conversation %s: %s", conversation_id, e)

    async def trash_all_conversations(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        category: str = "chats",
    ) -> int:
        """Move all conversations in a category to trash."""
        query = select(Conversation).where(
            Conversation.workspace_id == workspace_id,
            Conversation.is_archived == False,  # noqa: E712
        )
        if category == "delegated":
            query = query.where(
                Conversation.is_subagent == True,  # noqa: E712
                or_(
                    Conversation.subagent_agent_id.is_(None),
                    Conversation.subagent_agent_id == "workspace_agent",
                ),
            )
        else:
            query = query.where(Conversation.is_subagent == False)  # noqa: E712
        result = await db.execute(query)
        convs = result.scalars().all()
        now = datetime.now(timezone.utc)
        for conv in convs:
            conv.is_archived = True
            conv.archived_at = now
            conv.updated_at = now
        await db.commit()
        return len(convs)

    async def restore_all_conversations(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> int:
        """Restore all conversations from trash."""
        result = await db.execute(
            select(Conversation).where(
                Conversation.workspace_id == workspace_id,
                Conversation.is_archived == True,  # noqa: E712
            )
        )
        convs = result.scalars().all()
        now = datetime.now(timezone.utc)
        for conv in convs:
            conv.is_archived = False
            conv.archived_at = None
            conv.updated_at = now
        await db.commit()
        return len(convs)

    async def permanently_delete_all_conversations(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> int:
        """Permanently delete all conversations in trash."""
        result = await db.execute(
            select(Conversation).where(
                Conversation.workspace_id == workspace_id,
                Conversation.is_archived == True,  # noqa: E712
            )
        )
        convs = result.scalars().all()
        conv_ids = [str(c.id) for c in convs]
        for conv in convs:
            await db.delete(conv)
        await db.commit()
        # Clean up Qdrant embeddings
        try:
            from openforge.common.config import get_settings
            from openforge.db.qdrant_client import get_qdrant
            from qdrant_client import models as qdrant_models
            client = get_qdrant()
            settings = get_settings()
            for cid in conv_ids:
                client.delete(
                    collection_name=settings.qdrant_collection,
                    points_selector=qdrant_models.FilterSelector(
                        filter=qdrant_models.Filter(
                            must=[
                                qdrant_models.FieldCondition(
                                    key="conversation_id",
                                    match=qdrant_models.MatchValue(value=cid),
                                )
                            ]
                        )
                    ),
                )
        except Exception as e:
            logger.warning("Failed to delete Qdrant embeddings during bulk delete: %s", e)
        return len(conv_ids)

    @staticmethod
    def _sanitize_pg(value: str | None) -> str | None:
        """Strip null bytes that PostgreSQL text columns reject."""
        if value is None:
            return None
        return value.replace("\x00", "")

    @classmethod
    def _sanitize_pg_json(cls, value):
        """Recursively strip null bytes from strings inside JSON-serializable structures."""
        if value is None:
            return None
        if isinstance(value, str):
            return value.replace("\x00", "")
        if isinstance(value, list):
            return [cls._sanitize_pg_json(item) for item in value]
        if isinstance(value, dict):
            return {k: cls._sanitize_pg_json(v) for k, v in value.items()}
        return value

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
        tool_calls: list | None = None,
        timeline: list | None = None,
        is_interrupted: bool = False,
        provider_metadata: dict | None = None,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=self._sanitize_pg(content) or "",
            thinking=self._sanitize_pg(thinking),
            model_used=model_used,
            provider_used=provider_used,
            token_count=token_count,
            generation_ms=generation_ms,
            context_sources=self._sanitize_pg_json(context_sources),
            tool_calls=self._sanitize_pg_json(tool_calls),
            timeline=self._sanitize_pg_json(timeline),
            is_interrupted=is_interrupted,
            provider_metadata=provider_metadata,
        )
        db.add(msg)

        auto_title_workspace_id: UUID | None = None
        should_auto_title = False
        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count += 1
            conv.last_message_at = datetime.now(timezone.utc)
            conv.updated_at = datetime.now(timezone.utc)

            # Auto-generate title after each assistant reply unless manually locked.
            if trigger_auto_title and role == "assistant" and not conv.title_locked:
                should_auto_title = True
                auto_title_workspace_id = conv.workspace_id

        await db.commit()
        await db.refresh(msg)

        # Schedule title refresh only after commit so the latest assistant turn
        # is visible to the background title-generation session.
        if should_auto_title:
            import asyncio
            asyncio.create_task(
                self._auto_title(auto_title_workspace_id, conversation_id)
            )
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
        history = []
        for m in reversed(messages):
            content = m.content
            if m.role == "assistant" and getattr(m, "is_interrupted", False):
                content = (content + "\n\n[Response was interrupted by the user before completion]").lstrip()
            history.append({"role": m.role, "content": content})
        return history

    async def refresh_conversation_title(
        self,
        db: AsyncSession,
        workspace_id: UUID | None,
        conversation_id: UUID,
        *,
        provider_name: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> str | None:
        from openforge.core.llm_gateway import llm_gateway
        from openforge.core.prompt_resolution import resolve_prompt_text
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

        assistant_turn_count = sum(1 for m in all_messages if m.role == "assistant")
        if assistant_turn_count <= 0:
            return None

        window = all_messages[-24:]
        first_user_text = next(
            ((m.content or "").strip() for m in all_messages if m.role == "user" and (m.content or "").strip()),
            "",
        )
        latest_user_turn = next(
            ((m.content or "").strip() for m in reversed(all_messages) if m.role == "user" and (m.content or "").strip()),
            "",
        )
        latest_assistant_turn = next(
            ((m.content or "").strip() for m in reversed(all_messages) if m.role == "assistant" and (m.content or "").strip()),
            "",
        )
        is_first_title_generation = not (conv.title or "").strip()

        recent_payload = [
            {"role": m.role, "content": (m.content or "").strip()}
            for m in window
            if (m.content or "").strip()
        ]
        running_summary = build_running_title_summary(recent_payload)

        topic_shift_detected = has_chat_topic_shift(
            latest_user_turn,
            running_summary,
            conv.title or "",
        )

        weighted_seed = pick_weighted_title_seed_from_messages(
            recent_payload
        )
        primary_seed = weighted_seed.splitlines()[0].strip() if weighted_seed else ""
        assistant_seed = ""
        for line in weighted_seed.splitlines():
            if line.startswith("Assistant context: "):
                assistant_seed = line.removeprefix("Assistant context: ").strip()
                break

        latest_user_context = latest_user_turn or primary_seed or first_user_text
        latest_assistant_context = latest_assistant_turn or assistant_seed
        if not latest_user_context:
            return conv.title if conv.title else None

        transcript_lines: list[str] = []
        for payload in recent_payload[-12:]:
            role = str(payload.get("role") or "").strip().lower()
            content = str(payload.get("content") or "").strip()
            if not content:
                continue
            label = "User" if role == "user" else "Assistant"
            transcript_lines.append(f"{label}: {content[:420]}")
        recent_transcript = "\n".join(transcript_lines)

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

            candidate_models = [
                self._preferred_title_model(selected_provider_name, selected_model),
                selected_model,
            ]

            attempted_models: list[str] = []
            for candidate_model in candidate_models:
                model_name = (candidate_model or "").strip()
                if not model_name or model_name in attempted_models:
                    continue
                attempted_models.append(model_name)
                try:
                    title_prompt = await resolve_prompt_text(
                        db,
                        "conversation_title",
                        current_title=(conv.title or "").strip() or "(none)",
                        topic_shift_signal="yes" if topic_shift_detected else "no",
                        first_user_intent=(first_user_text or latest_user_context)[:600],
                        running_summary=(running_summary or weighted_seed or first_user_text)[:1400],
                        latest_user_turn=latest_user_context[:700],
                        latest_assistant_turn=latest_assistant_context[:900],
                        recent_transcript=recent_transcript[:3200],
                    )
                    raw_title = await llm_gateway.chat(
                        messages=[
                            {"role": "system", "content": title_prompt},
                        ],
                        provider_name=selected_provider_name,
                        api_key=selected_api_key or "",
                        model=model_name,
                        base_url=selected_base_url,
                        max_tokens=28,
                    )
                    if raw_title:
                        break
                except Exception as model_error:
                    logger.warning(
                        "Conversation title generation failed for %s on model %s: %s",
                        conversation_id,
                        model_name,
                        model_error,
                    )
        except Exception as e:
            logger.warning(
                "Conversation title generation failed for %s, using fallback: %s",
                conversation_id,
                e,
            )

        if (str(raw_title or "").strip().upper() == "__KEEP__") and conv.title:
            return conv.title
        if not str(raw_title or "").strip() and conv.title:
            return conv.title

        fallback_seed = primary_seed or latest_user_context or first_user_text or running_summary
        title = derive_chat_title(raw_title, fallback_seed)
        if title and not is_first_title_generation and not topic_shift_detected:
            if is_low_signal_chat_turn(title):
                return conv.title
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
        event = {
            "type": "conversation_updated",
            "conversation_id": str(conversation_id),
            "fields": ["title"],
        }
        if workspace_id is None:
            await ws_manager.send_to_conversation(str(conversation_id), event)
        else:
            await ws_manager.send_to_workspace(str(workspace_id), event)
        return next_title

    async def _auto_title(self, workspace_id: UUID | None, conversation_id: UUID):
        try:
            from openforge.db.postgres import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                await self.refresh_conversation_title(db, workspace_id, conversation_id)
        except Exception as e:
            logger.warning(f"Auto-title generation failed: {e}")


conversation_service = ConversationService()
