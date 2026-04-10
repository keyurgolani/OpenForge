from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openforge.db.postgres import get_db
from openforge.db.models import Workspace, Knowledge, KnowledgeTag, Conversation, Message, MessageAttachment, Config
from openforge.common.config import get_settings
from uuid import UUID
import zipfile
import json
import os
from io import BytesIO
from datetime import datetime

router = APIRouter()


def _dt(dt) -> str | None:
    return dt.isoformat() if dt else None


async def _build_workspace_data(db: AsyncSession, ws: Workspace) -> dict:
    """Return a serializable dict for one workspace (knowledge + conversations)."""
    # Knowledge
    k_rows = (await db.execute(select(Knowledge).where(Knowledge.workspace_id == ws.id))).scalars().all()
    knowledge_data = []
    for k in k_rows:
        tag_rows = (await db.execute(select(KnowledgeTag).where(KnowledgeTag.knowledge_id == k.id))).scalars().all()
        knowledge_data.append({
            "id": str(k.id),
            "type": k.type,
            "title": k.title,
            "content": k.content,
            "url": k.url,
            "ai_title": k.ai_title,
            "ai_summary": k.ai_summary,
            "is_pinned": k.is_pinned,
            "is_archived": k.is_archived,
            "word_count": k.word_count,
            "tags": [t.tag for t in tag_rows],
            "file_path": k.file_path,
            "file_size": k.file_size,
            "mime_type": k.mime_type,
            "file_metadata": k.file_metadata,
            "created_at": _dt(k.created_at),
            "updated_at": _dt(k.updated_at),
        })

    # Conversations + messages
    conv_rows = (await db.execute(select(Conversation))).scalars().all()
    conversations_data = []
    for conv in conv_rows:
        msg_rows = (await db.execute(
            select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
        )).scalars().all()
        messages_data = []
        for msg in msg_rows:
            att_rows = (await db.execute(
                select(MessageAttachment).where(MessageAttachment.message_id == msg.id)
            )).scalars().all()
            messages_data.append({
                "id": str(msg.id),
                "role": msg.role,
                "content": msg.content,
                "thinking": msg.thinking,
                "model_used": msg.model_used,
                "provider_used": msg.provider_used,
                "is_interrupted": msg.is_interrupted,
                "created_at": _dt(msg.created_at),
                "attachments": [
                    {
                        "id": str(att.id),
                        "filename": att.filename,
                        "content_type": att.content_type,
                        "file_size": att.file_size,
                        "source_url": att.source_url,
                        "file_path": att.file_path,
                    }
                    for att in att_rows
                ],
            })
        conversations_data.append({
            "id": str(conv.id),
            "title": conv.title,
            "is_archived": conv.is_archived,
            "message_count": conv.message_count,
            "created_at": _dt(conv.created_at),
            "updated_at": _dt(conv.updated_at),
            "messages": messages_data,
        })

    return {
        "workspace": {
            "id": str(ws.id),
            "name": ws.name,
            "description": ws.description,
            "icon": ws.icon,
            "color": ws.color,
        },
        "knowledge": knowledge_data,
        "conversations": conversations_data,
    }


async def _build_zip(db: AsyncSession, workspaces: list[Workspace]) -> BytesIO:
    settings = get_settings()
    buf = BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        ws_summaries = []

        for ws in workspaces:
            ws_data = await _build_workspace_data(db, ws)
            ws_summaries.append({"id": str(ws.id), "name": ws.name})

            zf.writestr(
                f"workspaces/{ws.id}/workspace.json",
                json.dumps(ws_data, indent=2, ensure_ascii=False),
            )

            # Include raw knowledge files that exist on disk
            for k_item in ws_data["knowledge"]:
                k_file_path = k_item.get("file_path", "")
                if not k_file_path:
                    continue
                if os.path.isfile(k_file_path):
                    try:
                        zf.write(
                            k_file_path,
                            f"workspaces/{ws.id}/knowledge-files/{os.path.basename(k_file_path)}",
                        )
                    except Exception:
                        pass

            # Include raw attachment files that exist on disk
            for conv in ws_data["conversations"]:
                for msg in conv["messages"]:
                    for att in msg["attachments"]:
                        file_path = att.get("file_path", "")
                        if not file_path:
                            continue
                        full_path = (
                            os.path.join(settings.workspace_root, str(ws.id), file_path)
                            if not os.path.isabs(file_path)
                            else file_path
                        )
                        if os.path.isfile(full_path):
                            try:
                                zf.write(full_path, f"workspaces/{ws.id}/files/{att['filename']}")
                            except Exception:
                                pass

        # Non-sensitive config
        cfg_rows = (await db.execute(
            select(Config).where(Config.sensitive == False)  # noqa: E712
        )).scalars().all()
        config_data = {c.key: c.value for c in cfg_rows}
        zf.writestr("config.json", json.dumps(config_data, indent=2, ensure_ascii=False))

        manifest = {
            "exported_at": datetime.utcnow().isoformat(),
            "version": "0.1.0",
            "workspaces": ws_summaries,
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    buf.seek(0)
    return buf


@router.get("/all")
async def export_all_data(db: AsyncSession = Depends(get_db)):
    """Export all workspaces as a single ZIP archive."""
    ws_rows = (await db.execute(select(Workspace).order_by(Workspace.sort_order))).scalars().all()
    buf = await _build_zip(db, list(ws_rows))
    filename = f"openforge-export-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/workspace/{workspace_id}")
async def export_workspace_data(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    """Export a single workspace as a ZIP archive."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    buf = await _build_zip(db, [ws])
    safe_name = ws.name.replace(" ", "_").replace("/", "_")
    filename = f"{safe_name}-export-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
