"""
Attachments API — file upload for chat messages.
Supports PDFs, images, and text files.
"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
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

router = APIRouter()
logger = logging.getLogger("openforge.attachments")

# Allowed file types
ALLOWED_TYPES = {
    "application/pdf": [".pdf"],
    "text/plain": [".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml"],
    "text/markdown": [".md"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


class AttachmentOut(BaseModel):
    id: str
    filename: str
    content_type: str
    file_size: int
    extracted_text: Optional[str] = None


async def extract_text_from_pdf(file_path: str) -> str:
    """Extract text content from a PDF file."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        return "\n\n".join(text_parts)[:50000]  # Limit to 50k chars
    except ImportError:
        logger.warning("PyMuPDF not installed, cannot extract PDF text")
        return ""
    except Exception as e:
        logger.error(f"Failed to extract PDF text: {e}")
        return ""


async def extract_text_from_image(file_path: str) -> str:
    """Extract text from an image using OCR (if available)."""
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(file_path)
        text = pytesseract.image_to_string(img)
        return text[:10000]  # Limit to 10k chars
    except ImportError:
        logger.warning("pytesseract/PIL not installed, cannot OCR images")
        return ""
    except Exception as e:
        logger.error(f"Failed to OCR image: {e}")
        return ""


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
            detail=f"File type {content_type} ({ext}) not allowed. Allowed types: PDF, images, text files."
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

    # Extract text based on file type (text attachments only for now).
    # PDF/image and other richer pipelines will be wired separately.
    extracted_text = ""
    if content_type.startswith("text/") or ext in [".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml"]:
        extracted_text = await extract_text_from_text_file(file_path)

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
        extracted_text=extracted_text[:2000] if extracted_text else None,  # Preview only
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
        extracted_text=attachment.extracted_text[:2000] if attachment.extracted_text else None,
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
