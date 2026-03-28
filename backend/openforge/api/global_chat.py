"""Global agent chat API — workspace-agnostic conversations with agents."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openforge.db.models import AgentModel, Conversation, Message
from openforge.db.postgres import get_db
from openforge.runtime.agent_registry import agent_registry
from openforge.services.conversation_service import conversation_service, _attachment_to_processed_summary

logger = logging.getLogger("openforge.api.global_chat")

router = APIRouter()


class GlobalConversationCreate(BaseModel):
    agent_id: UUID | None = None
    title: str | None = None


class GlobalConversationUpdate(BaseModel):
    title: str | None = None
    title_locked: bool | None = None
    is_pinned: bool | None = None
    is_archived: bool | None = None


class GlobalConversationResponse(BaseModel):
    id: UUID
    agent_id: UUID | None
    title: str | None
    message_count: int
    last_message_at: str | None
    created_at: str
    updated_at: str


class GlobalConversationListResponse(BaseModel):
    conversations: list[GlobalConversationResponse]
    total: int


class GlobalMessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    role: str = "user"
    model_id: str | None = None


class GlobalMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    model_used: str | None
    provider_used: str | None
    token_count: int | None
    tool_calls: list | None
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_conversation(c: Conversation) -> dict:
    agent_name = None
    if c.agent_id:
        try:
            agent_name = c.agent.name if c.agent else None
        except Exception:
            pass
    return {
        "id": c.id,
        "agent_id": c.agent_id,
        "agent_name": agent_name,
        "title": c.title,
        "title_locked": c.title_locked,
        "is_pinned": c.is_pinned,
        "is_archived": c.is_archived,
        "is_subagent": c.is_subagent,
        "subagent_agent_id": c.subagent_agent_id,
        "message_count": c.message_count,
        "last_message_at": str(c.last_message_at) if c.last_message_at else None,
        "created_at": str(c.created_at),
        "updated_at": str(c.updated_at),
    }


def _serialize_message(m: Message) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "thinking": getattr(m, "thinking", None),
        "model_used": m.model_used,
        "provider_used": m.provider_used,
        "token_count": m.token_count,
        "generation_ms": getattr(m, "generation_ms", None),
        "tool_calls": m.tool_calls,
        "context_sources": getattr(m, "context_sources", None),
        "attachments_processed": [_attachment_to_processed_summary(att) for att in (m.attachments or [])],
        "timeline": getattr(m, "timeline", None),
        "is_interrupted": getattr(m, "is_interrupted", False),
        "provider_metadata": getattr(m, "provider_metadata", None),
        "created_at": str(m.created_at),
    }


async def _get_global_conversation(db: AsyncSession, conversation_id: UUID) -> Conversation:
    """Fetch a global conversation or raise 404."""
    conversation = await db.get(Conversation, conversation_id)
    if not conversation or conversation.workspace_id is not None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def _require_global_chat_agent(db: AsyncSession, agent_id: UUID) -> AgentModel:
    """Validate that an agent can be used for global chat."""
    agent = await db.get(AgentModel, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.active_version_id is None:
        raise HTTPException(status_code=400, detail="Agent has no active version and is not ready for global chat")

    if await agent_registry.resolve(db, agent_id=agent.id) is None:
        raise HTTPException(status_code=400, detail="Agent is not ready for global chat")

    return agent


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_global_conversation(
    data: GlobalConversationCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a global conversation with a specific agent."""
    agent = None
    if data.agent_id is not None:
        agent = await _require_global_chat_agent(db, data.agent_id)

    title = data.title or ""
    conversation = Conversation(
        workspace_id=None,
        agent_id=data.agent_id,
        title=title,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    return _serialize_conversation(conversation)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/conversations")
async def list_global_conversations(
    skip: int = 0,
    limit: int = 50,
    agent_id: UUID | None = None,
    category: str = Query("chats", pattern="^(chats|delegated|trash)$"),
    db: AsyncSession = Depends(get_db),
):
    """List global conversations (those without a workspace_id)."""
    base_filter = Conversation.workspace_id.is_(None)

    if category == "trash":
        query = (
            select(Conversation)
            .where(base_filter, Conversation.is_archived.is_(True))
            .order_by(Conversation.updated_at.desc())
        )
        count_query = (
            select(func.count()).select_from(Conversation)
            .where(base_filter, Conversation.is_archived.is_(True))
        )
    elif category == "delegated":
        query = (
            select(Conversation)
            .where(
                base_filter,
                Conversation.is_archived.is_(False),
                Conversation.is_subagent.is_(True),
            )
            .order_by(Conversation.updated_at.desc())
        )
        count_query = (
            select(func.count()).select_from(Conversation)
            .where(
                base_filter,
                Conversation.is_archived.is_(False),
                Conversation.is_subagent.is_(True),
            )
        )
    else:  # chats
        query = (
            select(Conversation)
            .where(
                base_filter,
                Conversation.is_archived.is_(False),
                Conversation.is_subagent.is_(False),
            )
            .order_by(Conversation.updated_at.desc())
        )
        count_query = (
            select(func.count()).select_from(Conversation)
            .where(
                base_filter,
                Conversation.is_archived.is_(False),
                Conversation.is_subagent.is_(False),
            )
        )

    if agent_id:
        query = query.where(Conversation.agent_id == agent_id)
        count_query = count_query.where(Conversation.agent_id == agent_id)

    total = await db.scalar(count_query) or 0
    rows = (await db.execute(query.offset(skip).limit(limit))).scalars().all()

    return {
        "conversations": [_serialize_conversation(c) for c in rows],
        "total": total,
    }


# ── Bulk routes (must be above {conversation_id} routes) ─────────────────────

@router.post("/conversations/bulk/trash")
async def bulk_trash_global_conversations(
    category: str = Query("chats", pattern="^(chats|delegated)$"),
    db: AsyncSession = Depends(get_db),
):
    """Move all global conversations in a category to trash."""
    query = select(Conversation).where(
        Conversation.workspace_id.is_(None),
        Conversation.is_archived.is_(False),
    )
    if category == "delegated":
        query = query.where(Conversation.is_subagent.is_(True))
    else:
        query = query.where(Conversation.is_subagent.is_(False))

    result = await db.execute(query)
    convs = result.scalars().all()
    now = datetime.now(timezone.utc)
    for conv in convs:
        conv.is_archived = True
        conv.archived_at = now
        conv.updated_at = now
    await db.commit()
    return {"trashed": len(convs)}


@router.post("/conversations/bulk/restore")
async def bulk_restore_global_conversations(
    db: AsyncSession = Depends(get_db),
):
    """Restore all global conversations from trash."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.workspace_id.is_(None),
            Conversation.is_archived.is_(True),
        )
    )
    convs = result.scalars().all()
    now = datetime.now(timezone.utc)
    for conv in convs:
        conv.is_archived = False
        conv.archived_at = None
        conv.updated_at = now
    await db.commit()
    return {"restored": len(convs)}


@router.delete("/conversations/bulk/permanent", status_code=200)
async def bulk_permanently_delete_global_conversations(
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete all global conversations in trash."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.workspace_id.is_(None),
            Conversation.is_archived.is_(True),
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
    return {"deleted": len(conv_ids)}


# ── Single-conversation routes ────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}")
async def get_global_conversation(
    conversation_id: UUID,
    include_messages: bool = True,
    limit: int = Query(50, ge=1, le=500),
    before_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get a global conversation with optional paginated messages."""
    conversation = await _get_global_conversation(db, conversation_id)
    result = _serialize_conversation(conversation)

    if include_messages:
        query = select(Message).options(selectinload(Message.attachments)).where(Message.conversation_id == conversation_id)

        if before_id is not None:
            cursor_msg = await db.get(Message, before_id)
            if cursor_msg is None:
                raise HTTPException(status_code=404, detail="Cursor message not found")
            query = query.where(Message.created_at < cursor_msg.created_at)

        query = query.order_by(Message.created_at.desc()).limit(limit)
        msgs = list((await db.execute(query)).scalars().all())
        msgs.reverse()

        result["messages"] = [_serialize_message(m) for m in msgs]

    return result


@router.get("/conversations/{conversation_id}/stream-state")
async def get_global_conversation_stream_state(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Check the active stream state for a global conversation."""
    await _get_global_conversation(db, conversation_id)
    from openforge.runtime.chat_handler import chat_handler
    return await chat_handler.get_stream_state(None, conversation_id)


@router.put("/conversations/{conversation_id}")
async def update_global_conversation(
    conversation_id: UUID,
    data: GlobalConversationUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a global conversation (rename, lock title, pin)."""
    conversation = await _get_global_conversation(db, conversation_id)

    if data.title is not None:
        cleaned_title = data.title.strip()
        if not cleaned_title:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
        if len(cleaned_title) > 200:
            cleaned_title = cleaned_title[:200]
        conversation.title = cleaned_title
        if data.title_locked is None:
            conversation.title_locked = True
    if data.title_locked is not None:
        conversation.title_locked = data.title_locked
    if data.is_pinned is not None:
        conversation.is_pinned = data.is_pinned
    if data.is_archived is not None:
        conversation.is_archived = data.is_archived
        conversation.archived_at = datetime.now(timezone.utc) if data.is_archived else None

    conversation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(conversation)
    return _serialize_conversation(conversation)


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_global_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete (archive) a global conversation."""
    conversation = await _get_global_conversation(db, conversation_id)
    conversation.is_archived = True
    conversation.archived_at = datetime.now(timezone.utc)
    conversation.updated_at = datetime.now(timezone.utc)
    await db.commit()


@router.delete("/conversations/{conversation_id}/permanent", status_code=204)
async def permanently_delete_global_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a global conversation."""
    conversation = await _get_global_conversation(db, conversation_id)
    if not conversation.is_archived:
        raise HTTPException(
            status_code=400,
            detail="Only chats in Trash can be permanently deleted",
        )
    await db.delete(conversation)
    await db.commit()
    # Remove chat embeddings from Qdrant
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


@router.post("/conversations/{conversation_id}/messages")
async def add_global_message(
    conversation_id: UUID,
    data: GlobalMessageCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a message to a global conversation and trigger agent response."""
    conversation = await _get_global_conversation(db, conversation_id)

    message = await conversation_service.add_message(
        db,
        conversation_id,
        role=data.role,
        content=data.content,
        trigger_auto_title=False,
    )

    # If there's an agent, queue execution (no workspace_id for global chat)
    if conversation.agent_id:
        try:
            from openforge.worker.tasks import execute_agent_task
            task_kwargs = {
                "execution_id": str(message.id),
                "conversation_id": str(conversation_id),
                "user_message": data.content,
            }
            if data.model_id:
                task_kwargs["model_id"] = data.model_id
            execute_agent_task.delay(**task_kwargs)
        except Exception as exc:
            logger.error("Failed to dispatch agent task for conversation %s: %s", conversation_id, exc)

    return _serialize_message(message)


@router.get("/conversations/{conversation_id}/export")
async def export_global_conversation(
    conversation_id: UUID,
    format: str = Query("json", pattern="^(json|markdown|txt)$"),
    db: AsyncSession = Depends(get_db),
):
    """Export a global conversation in JSON, Markdown, or plain text format."""
    conversation = await _get_global_conversation(db, conversation_id)

    msgs = (await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )).scalars().all()

    title = conversation.title or "Untitled Chat"
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:50]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == "json":
        export_data = {
            "id": str(conversation.id),
            "title": conversation.title,
            "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
            "message_count": conversation.message_count,
            "messages": [
                {
                    "id": str(m.id),
                    "role": m.role,
                    "content": m.content,
                    "thinking": getattr(m, "thinking", None),
                    "model_used": m.model_used,
                    "provider_used": m.provider_used,
                    "token_count": m.token_count,
                    "timeline": getattr(m, "timeline", None),
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ],
        }
        content = json.dumps(export_data, indent=2, ensure_ascii=False)
        filename = f"{safe_title}_{timestamp}.json"
        media_type = "application/json"

    elif format == "markdown":
        lines = [
            f"# {title}",
            "",
            f"**Created:** {conversation.created_at.strftime('%Y-%m-%d %H:%M') if conversation.created_at else 'N/A'}",
            f"**Messages:** {conversation.message_count or len(msgs)}",
            "",
            "---",
            "",
        ]
        for m in msgs:
            role_label = "User" if m.role == "user" else "Assistant"
            lines.append(f"## {role_label}")
            if m.model_used:
                lines.append(f"*Model: {m.model_used}*")
                lines.append("")
            lines.append(m.content or "")
            lines.append("")
            lines.append("---")
            lines.append("")
        content = "\n".join(lines)
        filename = f"{safe_title}_{timestamp}.md"
        media_type = "text/markdown"

    else:  # txt
        lines = [
            f"Title: {title}",
            f"Created: {conversation.created_at.strftime('%Y-%m-%d %H:%M') if conversation.created_at else 'N/A'}",
            f"Messages: {conversation.message_count or len(msgs)}",
            "",
            "=" * 60,
            "",
        ]
        for m in msgs:
            role_label = "USER" if m.role == "user" else "ASSISTANT"
            lines.append(f"[{role_label}]")
            if m.model_used:
                lines.append(f"Model: {m.model_used}")
            lines.append(m.content or "")
            lines.append("")
            lines.append("-" * 40)
            lines.append("")
        content = "\n".join(lines)
        filename = f"{safe_title}_{timestamp}.txt"
        media_type = "text/plain"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
