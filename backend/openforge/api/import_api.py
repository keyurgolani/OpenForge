"""OpenForge import endpoint.

Accepts a ZIP archive previously exported from OpenForge and restores
workspaces, knowledge items, conversations, and messages.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.db.models import (
    Workspace,
    Knowledge,
    KnowledgeTag,
    Conversation,
    Message,
    MessageAttachment,
)
from openforge.common.config.settings import get_settings

router = APIRouter()
logger = logging.getLogger("openforge.import")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


async def _import_workspace(
    db: AsyncSession,
    ws_data: dict[str, Any],
    knowledge_files: dict[str, bytes],
    attachment_files: dict[str, bytes],
) -> tuple[int, int, list[str]]:
    """Import a single workspace and return (knowledge_count, chat_count, errors)."""
    settings = get_settings()
    errors: list[str] = []
    knowledge_count = 0
    chat_count = 0

    ws_info = ws_data.get("workspace", {})

    # Create workspace with a new id to avoid collisions
    new_ws_id = uuid.uuid4()
    workspace = Workspace(
        id=new_ws_id,
        name=ws_info.get("name", "Imported Workspace"),
        description=ws_info.get("description"),
        icon=ws_info.get("icon"),
        color=ws_info.get("color"),
        agent_enabled=ws_info.get("agent_enabled", True),
        agent_tool_categories=ws_info.get("agent_tool_categories", []),
    )
    db.add(workspace)
    await db.flush()

    # Map old ids to new ids for reference
    old_ws_id = ws_info.get("id", "")

    # ── Knowledge ───────────────────────────────────────────────────────
    for k_item in ws_data.get("knowledge", []):
        try:
            new_k_id = uuid.uuid4()
            knowledge = Knowledge(
                id=new_k_id,
                workspace_id=new_ws_id,
                type=k_item.get("type", "note"),
                title=(k_item.get("title") or "")[:500] or None,
                content=k_item.get("content", ""),
                url=k_item.get("url"),
                ai_title=k_item.get("ai_title"),
                ai_summary=k_item.get("ai_summary"),
                is_pinned=k_item.get("is_pinned", False),
                is_archived=k_item.get("is_archived", False),
                word_count=k_item.get("word_count", 0),
                mime_type=k_item.get("mime_type"),
                file_metadata=k_item.get("file_metadata"),
            )

            # Restore timestamps
            created = _parse_dt(k_item.get("created_at"))
            if created:
                knowledge.created_at = created
            updated = _parse_dt(k_item.get("updated_at"))
            if updated:
                knowledge.updated_at = updated

            # Restore file if present in the archive
            old_file_path = k_item.get("file_path", "")
            if old_file_path:
                basename = os.path.basename(old_file_path)
                archive_key = f"workspaces/{old_ws_id}/knowledge-files/{basename}"
                if archive_key in knowledge_files:
                    dest_dir = os.path.join(settings.uploads_root, str(new_ws_id), "knowledge")
                    os.makedirs(dest_dir, exist_ok=True)
                    dest_path = os.path.join(dest_dir, basename)
                    with open(dest_path, "wb") as f:
                        f.write(knowledge_files[archive_key])
                    knowledge.file_path = dest_path
                    knowledge.file_size = len(knowledge_files[archive_key])

            db.add(knowledge)
            await db.flush()

            # Tags
            for tag_str in k_item.get("tags", []):
                tag_clean = str(tag_str).lower().strip()
                if tag_clean:
                    db.add(KnowledgeTag(
                        knowledge_id=new_k_id,
                        tag=tag_clean,
                        source="import",
                    ))

            knowledge_count += 1
        except Exception as exc:
            errors.append(f"Knowledge '{k_item.get('title', '?')}': {exc}")

    # ── Conversations ───────────────────────────────────────────────────
    for conv_item in ws_data.get("conversations", []):
        try:
            new_conv_id = uuid.uuid4()
            conversation = Conversation(
                id=new_conv_id,
                workspace_id=new_ws_id,
                title=conv_item.get("title"),
                is_archived=conv_item.get("is_archived", False),
                message_count=conv_item.get("message_count", 0),
            )
            created = _parse_dt(conv_item.get("created_at"))
            if created:
                conversation.created_at = created
            updated = _parse_dt(conv_item.get("updated_at"))
            if updated:
                conversation.updated_at = updated

            db.add(conversation)
            await db.flush()

            # Messages
            msg_count = 0
            for msg_item in conv_item.get("messages", []):
                try:
                    new_msg_id = uuid.uuid4()
                    message = Message(
                        id=new_msg_id,
                        conversation_id=new_conv_id,
                        role=msg_item.get("role", "user"),
                        content=msg_item.get("content", ""),
                        thinking=msg_item.get("thinking"),
                        model_used=msg_item.get("model_used"),
                        provider_used=msg_item.get("provider_used"),
                        is_interrupted=msg_item.get("is_interrupted", False),
                    )
                    msg_created = _parse_dt(msg_item.get("created_at"))
                    if msg_created:
                        message.created_at = msg_created

                    db.add(message)
                    await db.flush()
                    msg_count += 1

                    # Attachments
                    for att_item in msg_item.get("attachments", []):
                        try:
                            att_filename = att_item.get("filename", "unknown")
                            archive_key = f"workspaces/{old_ws_id}/files/{att_filename}"

                            new_file_path = ""
                            file_size = att_item.get("file_size", 0)

                            if archive_key in attachment_files:
                                dest_dir = os.path.join(
                                    settings.workspace_root, str(new_ws_id), "attachments"
                                )
                                os.makedirs(dest_dir, exist_ok=True)
                                dest_path = os.path.join(dest_dir, att_filename)
                                with open(dest_path, "wb") as f:
                                    f.write(attachment_files[archive_key])
                                new_file_path = f"attachments/{att_filename}"
                                file_size = len(attachment_files[archive_key])

                            db.add(MessageAttachment(
                                id=uuid.uuid4(),
                                message_id=new_msg_id,
                                filename=att_filename,
                                content_type=att_item.get("content_type", "application/octet-stream"),
                                file_size=file_size,
                                file_path=new_file_path,
                                source_url=att_item.get("source_url"),
                            ))
                        except Exception as exc:
                            errors.append(f"Attachment '{att_item.get('filename', '?')}': {exc}")

                except Exception as exc:
                    errors.append(f"Message in '{conv_item.get('title', '?')}': {exc}")

            # Update actual message count
            conversation.message_count = msg_count
            chat_count += 1

        except Exception as exc:
            errors.append(f"Conversation '{conv_item.get('title', '?')}': {exc}")

    return knowledge_count, chat_count, errors


@router.post("/openforge")
async def import_openforge(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Import an OpenForge ZIP archive."""
    content = await file.read()

    try:
        zf = zipfile.ZipFile(BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    # Read manifest
    try:
        manifest = json.loads(zf.read("manifest.json"))
    except (KeyError, json.JSONDecodeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid OpenForge archive: missing or corrupt manifest.json",
        )

    # Collect all file bytes keyed by archive path
    knowledge_files: dict[str, bytes] = {}
    attachment_files: dict[str, bytes] = {}
    for name in zf.namelist():
        if "/knowledge-files/" in name:
            knowledge_files[name] = zf.read(name)
        elif "/files/" in name:
            attachment_files[name] = zf.read(name)

    total_workspaces = 0
    total_knowledge = 0
    total_chats = 0
    all_errors: list[str] = []

    # Process each workspace listed in the manifest
    ws_entries = manifest.get("workspaces", [])
    if not ws_entries:
        # Fallback: scan for workspace.json files
        for name in zf.namelist():
            if name.endswith("/workspace.json"):
                parts = name.split("/")
                if len(parts) >= 2:
                    ws_entries.append({"id": parts[-2]})

    for ws_entry in ws_entries:
        ws_id = ws_entry.get("id", "")
        ws_json_path = f"workspaces/{ws_id}/workspace.json"

        try:
            ws_data = json.loads(zf.read(ws_json_path))
        except (KeyError, json.JSONDecodeError) as exc:
            all_errors.append(f"Workspace {ws_id}: could not read workspace.json ({exc})")
            continue

        try:
            k_count, c_count, ws_errors = await _import_workspace(
                db, ws_data, knowledge_files, attachment_files,
            )
            total_workspaces += 1
            total_knowledge += k_count
            total_chats += c_count
            all_errors.extend(ws_errors)
        except Exception as exc:
            all_errors.append(f"Workspace {ws_id}: {exc}")

    await db.commit()
    zf.close()

    return {
        "success": True,
        "workspaces_imported": total_workspaces,
        "knowledge_count": total_knowledge,
        "chat_count": total_chats,
        "errors": all_errors,
    }
