"""
Attachments API — file upload for chat messages.
Supports PDFs, images, text files, audio, and Office documents.
"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from uuid import UUID
import uuid
import os
import aiofiles
import logging
from typing import Optional

from openforge.db.postgres import get_db
from openforge.db.models import MessageAttachment, Message
from openforge.config import get_settings
from openforge.schemas.knowledge import KnowledgeCreate
from openforge.services.knowledge_service import knowledge_service
from openforge.services.attachment_pipeline import get_extractor, resolve_attachment_pipeline

router = APIRouter()
logger = logging.getLogger("openforge.attachments")

# Allowed file types
ALLOWED_TYPES = {
    # Text
    "text/plain": [".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml"],
    "text/markdown": [".md"],
    # Images
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    # PDF
    "application/pdf": [".pdf"],
    # Audio
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/x-wav": [".wav"],
    "audio/ogg": [".ogg"],
    "audio/flac": [".flac"],
    "audio/mp4": [".m4a"],
    "audio/x-m4a": [".m4a"],
    "audio/webm": [".webm", ".weba"],
    "video/webm": [".webm"],
    # Office documents
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    "application/vnd.ms-powerpoint": [".ppt"],
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


class AttachmentOut(BaseModel):
    id: str
    filename: str
    content_type: str
    file_size: int
    extracted_text: Optional[str] = None
    pipeline: Optional[str] = None


async def extract_text_from_text_file(file_path: str) -> str:
    """Read text from a plain text file."""
    try:
        async with aiofiles.open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = await f.read()
            return content[:50000]  # Limit to 50k chars
    except Exception as e:
        logger.error(f"Failed to read text file: {e}")
        return ""


@router.post("/upload", response_model=AttachmentOut)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file attachment for chat."""
    # Validate file type
    content_type = file.content_type or "application/octet-stream"
    ext = os.path.splitext(file.filename or "unknown")[1].lower()

    # Check if content type or extension is allowed
    is_allowed = False
    for allowed_type, extensions in ALLOWED_TYPES.items():
        if content_type == allowed_type or ext in extensions:
            is_allowed = True
            break

    if not is_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"File type {content_type} ({ext}) not allowed."
        )

    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # Create uploads directory if needed
    settings = get_settings()
    uploads_dir = os.path.join(settings.uploads_root, "chat-attachments")
    os.makedirs(uploads_dir, exist_ok=True)

    # Generate unique filename
    file_id = uuid.uuid4()
    safe_filename = f"{file_id}{ext}"
    file_path = os.path.join(uploads_dir, safe_filename)

    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)

    # Extract text using the unified attachment pipeline
    extracted_text = ""
    extractor = get_extractor(content_type, file.filename)
    if extractor:
        try:
            extracted_text = await extractor.extract(file_path) or ""
        except Exception as e:
            logger.warning(f"Extraction failed for {file.filename}: {e}")
            extracted_text = ""

    # Persist attachment record; it will be linked to a message when chat is sent.
    attachment = MessageAttachment(
        id=file_id,
        message_id=None,
        filename=file.filename or "unknown",
        content_type=content_type,
        file_size=len(content),
        file_path=file_path,
        extracted_text=extracted_text or None,
    )

    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return AttachmentOut(
        id=str(file_id),
        filename=file.filename or "unknown",
        content_type=content_type,
        file_size=len(content),
        extracted_text=extracted_text or None,
        pipeline=extractor.pipeline if extractor else resolve_attachment_pipeline(content_type, file.filename),
    )


@router.get("/{attachment_id}", response_model=AttachmentOut)
async def get_attachment(
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get attachment details."""
    result = await db.execute(
        select(MessageAttachment).where(MessageAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return AttachmentOut(
        id=str(attachment.id),
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        extracted_text=attachment.extracted_text or None,
        pipeline=resolve_attachment_pipeline(attachment.content_type, attachment.filename),
    )


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an attachment."""
    result = await db.execute(
        select(MessageAttachment).where(MessageAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Delete file from disk
    try:
        if os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    except Exception as e:
        logger.warning(f"Failed to delete attachment file: {e}")

    await db.delete(attachment)
    await db.commit()

    return {"status": "deleted"}


class SaveToKnowledgeRequest(BaseModel):
    workspace_id: UUID
    knowledge_type: Optional[str] = None
    content: Optional[str] = None


class SaveToKnowledgeResponse(BaseModel):
    knowledge_id: str


@router.post("/{attachment_id}/save-to-knowledge", response_model=SaveToKnowledgeResponse)
async def save_attachment_to_knowledge(
    attachment_id: UUID,
    body: SaveToKnowledgeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Save an attachment's extracted content to workspace knowledge."""
    result = await db.execute(
        select(MessageAttachment).where(MessageAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    content = body.content if body.content else attachment.extracted_text

    if not content:
        raise HTTPException(status_code=422, detail="Attachment has no extracted content to save")

    source_url = getattr(attachment, "source_url", None)

    if body.knowledge_type:
        knowledge_type = body.knowledge_type
    elif source_url:
        knowledge_type = "bookmark"
    else:
        knowledge_type = "note"

    data = KnowledgeCreate(
        type=knowledge_type,
        url=source_url if source_url else None,
        title=attachment.filename or None,
        content=content,
    )

    knowledge = await knowledge_service.create_knowledge(
        db, body.workspace_id, data, background_tasks
    )

    return SaveToKnowledgeResponse(knowledge_id=str(knowledge.id))
