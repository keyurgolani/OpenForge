"""
Knowledge file upload API.

Provides endpoints for uploading files (images, audio, PDF, DOCX, XLSX, PPTX, text)
and processing them through the appropriate knowledge processors.
"""
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, UploadFile, Form, File
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
import logging
import os
from pathlib import Path

from openforge.db.postgres import get_db
from openforge.db.models import Knowledge
from openforge.config import get_settings

logger = logging.getLogger("openforge.knowledge_upload")

router = APIRouter()

# Mapping from MIME type prefix/exact to knowledge_type
MIME_TYPE_MAP = {
    "image/": "image",
    "audio/": "audio",
    "application/pdf": "pdf",
    "text/plain": "text",
    "text/markdown": "text",
    "text/": "text",
    "application/msword": "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
}


def _resolve_knowledge_type(content_type: str, filename: str) -> Optional[str]:
    """Resolve the knowledge type from MIME type or file extension."""
    if content_type:
        # Check exact match first
        if content_type in MIME_TYPE_MAP:
            return MIME_TYPE_MAP[content_type]
        # Check prefix match
        for prefix, ktype in MIME_TYPE_MAP.items():
            if content_type.startswith(prefix):
                return ktype

    # Fallback to file extension
    if filename:
        ext = Path(filename).suffix.lower()
        ext_map = {
            ".jpg": "image", ".jpeg": "image", ".png": "image",
            ".gif": "image", ".webp": "image", ".bmp": "image",
            ".mp3": "audio", ".wav": "audio", ".ogg": "audio",
            ".m4a": "audio", ".flac": "audio",
            ".pdf": "pdf",
            ".txt": "text", ".md": "text", ".markdown": "text",
            ".doc": "docx", ".docx": "docx",
            ".xls": "xlsx", ".xlsx": "xlsx",
            ".ppt": "pptx", ".pptx": "pptx",
        }
        return ext_map.get(ext)

    return None


@router.post("/workspaces/{wid}/knowledge/upload")
async def upload_knowledge(
    wid: UUID,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = None,
):
    """
    Upload a file and create a knowledge record.

    Routes the content to appropriate processors for:
    - image files → ImageProcessor
    - audio files → AudioProcessor
    - PDF files → PDFProcessor
    - DOCX files → DocxProcessor
    - XLSX files → XlsxProcessor
    - PPTX files → PptxProcessor
    - text files → direct text extraction
    """
    knowledge_type = _resolve_knowledge_type(file.content_type, file.filename)

    if not knowledge_type:
        raise HTTPException(400, f"Unsupported file type: {file.content_type or 'unknown'}")

    # Save file to workspace directory
    settings = get_settings()
    workspace_root = settings.workspace_root
    workspace_dir = Path(workspace_root) / str(wid) / "knowledge"
    workspace_dir.mkdir(parents=True, exist_ok=True)

    file_path = workspace_dir / file.filename
    try:
        # Handle filename conflicts
        counter = 1
        while os.path.exists(file_path):
            stem = Path(file.filename).stem
            suffix = Path(file.filename).suffix
            file_path = workspace_dir / f"{stem}_{counter}{suffix}"
            counter += 1

        # Save file
        file_data = await file.read()
        with open(file_path, "wb") as f:
            f.write(file_data)

        # Create knowledge record
        knowledge_record = Knowledge(
            workspace_id=wid,
            type=knowledge_type,
            title=title or file.filename,
            content="",
            url=None,
            file_path=str(file_path),
            file_size=len(file_data),
            mime_type=file.content_type,
            word_count=0,
            embedding_status="pending",
        )
        db.add(knowledge_record)
        await db.commit()
        await db.refresh(knowledge_record)

        # Process based on type
        process_result = None

        if knowledge_type == "image":
            from openforge.core.knowledge_processors.image_processor import ImageProcessor
            processor = ImageProcessor()
            try:
                # Try to get vision provider config
                try:
                    vision_provider_config = await _get_vision_provider_config(db, wid)
                except Exception:
                    vision_provider_config = None

                process_result = await processor.process(
                    file_path=str(file_path),
                    workspace_id=wid,
                    knowledge_id=knowledge_record.id,
                    vision_provider_config=vision_provider_config,
                )
                if process_result.success:
                    knowledge_record.content = process_result.content or process_result.extracted_text or ""
                    if process_result.ai_title:
                        knowledge_record.title = process_result.ai_title
                    if process_result.thumbnail_path:
                        knowledge_record.thumbnail_path = process_result.thumbnail_path
                    knowledge_record.word_count = len((knowledge_record.content or "").split())
                    knowledge_record.embedding_status = "complete" if process_result.embedded else "pending"
                    await db.commit()
            except Exception as e:
                logger.error(f"Image processing failed: {e}")

        elif knowledge_type == "audio":
            from openforge.core.knowledge_processors.audio_processor import AudioProcessor
            processor = AudioProcessor()
            try:
                try:
                    title_provider_config = await _get_title_provider_config(db, wid)
                except Exception:
                    title_provider_config = None

                process_result = await processor.process(
                    file_path=str(file_path),
                    workspace_id=wid,
                    knowledge_id=knowledge_record.id,
                    whisper_model_size="medium",
                    title_provider_config=title_provider_config,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.ai_title:
                        knowledge_record.title = process_result.ai_title
                    knowledge_record.word_count = len((knowledge_record.content or "").split())
                    knowledge_record.embedding_status = "complete" if process_result.embedded else "pending"
                    await db.commit()
            except Exception as e:
                logger.error(f"Audio processing failed: {e}")

        elif knowledge_type == "pdf":
            from openforge.core.knowledge_processors.pdf_processor import PDFProcessor
            processor = PDFProcessor()
            try:
                process_result = await processor.process(
                    file_path=str(file_path),
                    workspace_id=wid,
                    knowledge_id=knowledge_record.id,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.ai_title:
                        knowledge_record.title = process_result.ai_title
                    if process_result.thumbnail_path:
                        knowledge_record.thumbnail_path = process_result.thumbnail_path
                    knowledge_record.word_count = len((knowledge_record.content or "").split())
                    knowledge_record.embedding_status = "complete" if process_result.embedded else "pending"
                    await db.commit()
            except Exception as e:
                logger.error(f"PDF processing failed: {e}")

        elif knowledge_type == "docx":
            from openforge.core.knowledge_processors.docx_processor import DocxProcessor
            processor = DocxProcessor()
            try:
                process_result = await processor.process(
                    file_path=str(file_path),
                    workspace_id=wid,
                    knowledge_id=knowledge_record.id,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.thumbnail_path:
                        knowledge_record.thumbnail_path = process_result.thumbnail_path
                    knowledge_record.word_count = len((knowledge_record.content or "").split())
                    knowledge_record.embedding_status = "complete" if process_result.embedded else "pending"
                    await db.commit()
            except Exception as e:
                logger.error(f"DOCX processing failed: {e}")

        elif knowledge_type == "xlsx":
            from openforge.core.knowledge_processors.xlsx_processor import XlsxProcessor
            processor = XlsxProcessor()
            try:
                process_result = await processor.process(
                    file_path=str(file_path),
                    workspace_id=wid,
                    knowledge_id=knowledge_record.id,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.thumbnail_path:
                        knowledge_record.thumbnail_path = process_result.thumbnail_path
                    knowledge_record.word_count = len((knowledge_record.content or "").split())
                    knowledge_record.embedding_status = "complete" if process_result.embedded else "pending"
                    await db.commit()
            except Exception as e:
                logger.error(f"XLSX processing failed: {e}")

        elif knowledge_type == "pptx":
            from openforge.core.knowledge_processors.pptx_processor import PptxProcessor
            processor = PptxProcessor()
            try:
                process_result = await processor.process(
                    file_path=str(file_path),
                    workspace_id=wid,
                    knowledge_id=knowledge_record.id,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.thumbnail_path:
                        knowledge_record.thumbnail_path = process_result.thumbnail_path
                    knowledge_record.word_count = len((knowledge_record.content or "").split())
                    knowledge_record.embedding_status = "complete" if process_result.embedded else "pending"
                    await db.commit()
            except Exception as e:
                logger.error(f"PPTX processing failed: {e}")

        elif knowledge_type == "text":
            try:
                text_content = file_data.decode("utf-8", errors="replace")
                knowledge_record.content = text_content
                knowledge_record.word_count = len(text_content.split())
                knowledge_record.embedding_status = "pending"
                await db.commit()
            except Exception as e:
                logger.error(f"Text file processing failed: {e}")

        return {
            "id": str(knowledge_record.id),
            "title": knowledge_record.title,
            "type": knowledge_type,
            "filename": file.filename,
            "file_path": str(file_path).replace(str(workspace_root), "/files/"),
            "message": "Knowledge uploaded successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error uploading knowledge: {e}")
        raise HTTPException(500, f"Failed to process upload: {str(e)}")


async def _get_vision_provider_config(db: AsyncSession, workspace_id: UUID) -> dict:
    """Get vision provider config for workspace."""
    from openforge.services.llm_service import llm_service
    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)

    return {
        "provider_id": provider_name,
        "model": model or "gpt-4o-mini",
        "api_key": api_key,
    }


async def _get_title_provider_config(db: AsyncSession, workspace_id: UUID) -> dict:
    """Get title provider config for workspace."""
    from openforge.services.llm_service import llm_service
    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)

    return {
        "provider_id": provider_name,
        "model": model or "gpt-4o-mini",
        "api_key": api_key,
    }
