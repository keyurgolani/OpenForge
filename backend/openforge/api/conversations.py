from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
import json
from datetime import datetime
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
    category: str = Query("chats", regex="^(chats|subagent|trash)$"),
    db: AsyncSession = Depends(get_db),
):
    return await conversation_service.list_conversations(
        db, workspace_id, include_archived=include_archived, category=category,
    )


@router.post("/{workspace_id}/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    workspace_id: UUID, body: ConversationCreate, db: AsyncSession = Depends(get_db)
):
    return await conversation_service.create_conversation(db, workspace_id, body)


# ── Bulk routes (must be above {conversation_id} routes) ──────────────────────

@router.post("/{workspace_id}/conversations/bulk/trash")
async def bulk_trash_conversations(
    workspace_id: UUID,
    category: str = Query("chats", regex="^(chats|subagent)$"),
    db: AsyncSession = Depends(get_db),
):
    count = await conversation_service.trash_all_conversations(db, workspace_id, category)
    return {"trashed": count}


@router.post("/{workspace_id}/conversations/bulk/restore")
async def bulk_restore_conversations(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    count = await conversation_service.restore_all_conversations(db, workspace_id)
    return {"restored": count}


@router.delete("/{workspace_id}/conversations/bulk/permanent", status_code=200)
async def bulk_permanently_delete_conversations(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    count = await conversation_service.permanently_delete_all_conversations(db, workspace_id)
    return {"deleted": count}


# ── Single-conversation routes ────────────────────────────────────────────────

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


@router.get("/{workspace_id}/conversations/{conversation_id}/export")
async def export_conversation(
    workspace_id: UUID,
    conversation_id: UUID,
    format: str = Query("json", regex="^(json|markdown|txt)$"),
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """
    Export a conversation with all messages in JSON, Markdown, or plain text format.
    """
    conv = await conversation_service.get_conversation_with_messages(
        db,
        conversation_id,
        limit=10000,  # Get all messages
        workspace_id=workspace_id,
        include_archived=include_archived,
    )

    # Prepare filename
    title = conv.title or "Untitled Chat"
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:50]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == "json":
        # JSON export
        export_data = {
            "id": str(conv.id),
            "title": conv.title,
            "workspace_id": str(conv.workspace_id),
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            "message_count": conv.message_count,
            "messages": [
                {
                    "id": str(msg.id),
                    "role": msg.role,
                    "content": msg.content,
                    "thinking": msg.thinking,
                    "model_used": msg.model_used,
                    "provider_used": msg.provider_used,
                    "token_count": msg.token_count,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None,
                }
                for msg in (conv.messages or [])
            ],
        }
        content = json.dumps(export_data, indent=2, ensure_ascii=False)
        filename = f"{safe_title}_{timestamp}.json"
        media_type = "application/json"

    elif format == "markdown":
        # Markdown export
        lines = [
            f"# {conv.title or 'Untitled Chat'}",
            "",
            f"**Created:** {conv.created_at.strftime('%Y-%m-%d %H:%M') if conv.created_at else 'N/A'}",
            f"**Messages:** {conv.message_count or len(conv.messages or [])}",
            "",
            "---",
            "",
        ]
        for msg in (conv.messages or []):
            role_label = "🧑 User" if msg.role == "user" else "🤖 Assistant"
            lines.append(f"## {role_label}")
            if msg.model_used:
                lines.append(f"*Model: {msg.model_used}*")
                lines.append("")
            lines.append(msg.content or "")
            if msg.thinking:
                lines.append("")
                lines.append("<details>")
                lines.append("<summary>Thinking</summary>")
                lines.append("")
                lines.append(msg.thinking)
                lines.append("</details>")
            lines.append("")
            lines.append("---")
            lines.append("")

        content = "\n".join(lines)
        filename = f"{safe_title}_{timestamp}.md"
        media_type = "text/markdown"

    else:  # txt
        # Plain text export
        lines = [
            f"Title: {conv.title or 'Untitled Chat'}",
            f"Created: {conv.created_at.strftime('%Y-%m-%d %H:%M') if conv.created_at else 'N/A'}",
            f"Messages: {conv.message_count or len(conv.messages or [])}",
            "",
            "=" * 60,
            "",
        ]
        for msg in (conv.messages or []):
            role_label = "USER" if msg.role == "user" else "ASSISTANT"
            lines.append(f"[{role_label}]")
            if msg.model_used:
                lines.append(f"Model: {msg.model_used}")
            lines.append("")
            lines.append(msg.content or "")
            lines.append("")
            lines.append("-" * 40)
            lines.append("")

        content = "\n".join(lines)
        filename = f"{safe_title}_{timestamp}.txt"
        media_type = "text/plain"

    # Return as streaming response for download
    import io
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
