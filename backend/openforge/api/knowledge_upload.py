"""
Knowledge Upload API — file upload for file-based knowledge types.
Supports: Image, Audio, PDF, Document (DOCX), Sheet (XLSX), Slides (PPTX)
"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import uuid
import os
import aiofiles
import logging
from typing import Optional

from openforge.db.postgres import get_db
from openforge.db.models import Knowledge
from openforge.config import get_settings
from openforge.schemas.knowledge import KnowledgeResponse

router = APIRouter()
logger = logging.getLogger("openforge.knowledge_upload")

# Allowed MIME types and their knowledge types
ALLOWED_UPLOAD_TYPES: dict[str, dict] = {
    # Images
    "image/png": {"knowledge_type": "image", "extensions": [".png"]},
    "image/jpeg": {"knowledge_type": "image", "extensions": [".jpg", ".jpeg"]},
    "image/gif": {"knowledge_type": "image", "extensions": [".gif"]},
    "image/webp": {"knowledge_type": "image", "extensions": [".webp"]},
    "image/bmp": {"knowledge_type": "image", "extensions": [".bmp"]},
    "image/tiff": {"knowledge_type": "image", "extensions": [".tiff", ".tif"]},
    # Audio
    "audio/mpeg": {"knowledge_type": "audio", "extensions": [".mp3"]},
    "audio/wav": {"knowledge_type": "audio", "extensions": [".wav"]},
    "audio/x-wav": {"knowledge_type": "audio", "extensions": [".wav"]},
    "audio/ogg": {"knowledge_type": "audio", "extensions": [".ogg"]},
    "audio/flac": {"knowledge_type": "audio", "extensions": [".flac"]},
    "audio/mp4": {"knowledge_type": "audio", "extensions": [".m4a"]},
    "audio/x-m4a": {"knowledge_type": "audio", "extensions": [".m4a"]},
    "audio/webm": {"knowledge_type": "audio", "extensions": [".weba"]},
    # PDF
    "application/pdf": {"knowledge_type": "pdf", "extensions": [".pdf"]},
    # Word
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        "knowledge_type": "document",
        "extensions": [".docx"],
    },
    "application/msword": {"knowledge_type": "document", "extensions": [".doc"]},
    # Excel
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        "knowledge_type": "sheet",
        "extensions": [".xlsx"],
    },
    "application/vnd.ms-excel": {"knowledge_type": "sheet", "extensions": [".xls"]},
    # PowerPoint
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
        "knowledge_type": "slides",
        "extensions": [".pptx"],
    },
    "application/vnd.ms-powerpoint": {"knowledge_type": "slides", "extensions": [".ppt"]},
}

# Extension-based fallback mapping
EXTENSION_TO_TYPE: dict[str, str] = {}
for _mime, _info in ALLOWED_UPLOAD_TYPES.items():
    for _ext in _info["extensions"]:
        EXTENSION_TO_TYPE[_ext] = _info["knowledge_type"]

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


def _resolve_knowledge_type(content_type: str, filename: str) -> Optional[str]:
    """Resolve the knowledge type from content type or file extension."""
    ct = content_type.strip().lower().split(";")[0].strip()
    ext = os.path.splitext(filename)[1].lower()

    # Check MIME type first
    if ct in ALLOWED_UPLOAD_TYPES:
        return ALLOWED_UPLOAD_TYPES[ct]["knowledge_type"]

    # Fall back to extension
    if ext in EXTENSION_TO_TYPE:
        return EXTENSION_TO_TYPE[ext]

    return None


@router.post("/{workspace_id}/knowledge/upload", response_model=KnowledgeResponse, status_code=201)
async def upload_knowledge_file(
    workspace_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file to create a new knowledge item."""
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()

    # Validate file type
    knowledge_type = _resolve_knowledge_type(content_type, filename)
    if not knowledge_type:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{content_type}' ({ext}) is not supported. "
            f"Supported: images, audio, PDF, DOCX, XLSX/XLS, PPTX.",
        )

    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB.",
        )

    # Save file to disk
    settings = get_settings()
    uploads_dir = os.path.join(settings.uploads_root, "knowledge-files", str(workspace_id))
    os.makedirs(uploads_dir, exist_ok=True)

    knowledge_id = uuid.uuid4()
    safe_filename = f"{knowledge_id}{ext}"
    file_path = os.path.join(uploads_dir, safe_filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Create knowledge record
    knowledge = Knowledge(
        id=knowledge_id,
        workspace_id=workspace_id,
        type=knowledge_type,
        title=os.path.splitext(filename)[0],  # Use filename (without ext) as initial title
        content="",
        file_path=file_path,
        file_size=len(content),
        mime_type=content_type,
        embedding_status="processing",
    )

    db.add(knowledge)
    await db.commit()
    await db.refresh(knowledge)

    # Queue background processing
    background_tasks.add_task(
        _process_knowledge_file,
        knowledge_id=knowledge_id,
        workspace_id=workspace_id,
        knowledge_type=knowledge_type,
        file_path=file_path,
    )

    # Build response
    from openforge.schemas.knowledge import KnowledgeResponse as KResp
    return KResp(
        id=knowledge.id,
        workspace_id=knowledge.workspace_id,
        type=knowledge.type,
        title=knowledge.title,
        content=knowledge.content,
        is_pinned=knowledge.is_pinned,
        is_archived=knowledge.is_archived,
        embedding_status=knowledge.embedding_status,
        word_count=knowledge.word_count,
        tags=[],
        file_path=knowledge.file_path,
        file_size=knowledge.file_size,
        mime_type=knowledge.mime_type,
        thumbnail_path=knowledge.thumbnail_path,
        file_metadata=knowledge.file_metadata,
        created_at=knowledge.created_at,
        updated_at=knowledge.updated_at,
    )


async def _process_knowledge_file(
    knowledge_id: UUID,
    workspace_id: UUID,
    knowledge_type: str,
    file_path: str,
):
    """Background task: run the appropriate processor for the file type."""
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.api.websocket import ws_manager

    logger.info("Processing %s knowledge %s", knowledge_type, knowledge_id)

    processor_result: dict = {}
    extraction_succeeded = False

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Knowledge).where(Knowledge.id == knowledge_id)
            )
            knowledge = result.scalar_one_or_none()
            if not knowledge:
                logger.error("Knowledge %s not found for processing", knowledge_id)
                return

            # Dispatch to the correct processor
            processor_result = await _run_processor(
                knowledge_type, knowledge_id, file_path, workspace_id, db
            )

            # Update knowledge record with processor results
            if processor_result.get("content"):
                knowledge.content = processor_result["content"]
                knowledge.word_count = len(processor_result["content"].split())

            if processor_result.get("ai_title"):
                knowledge.ai_title = processor_result["ai_title"]
                if not knowledge.title or knowledge.title == os.path.splitext(os.path.basename(file_path))[0]:
                    knowledge.title = processor_result["ai_title"]

            if processor_result.get("ai_summary"):
                knowledge.ai_summary = processor_result["ai_summary"]

            if processor_result.get("thumbnail_path"):
                knowledge.thumbnail_path = processor_result["thumbnail_path"]

            if processor_result.get("file_path"):
                knowledge.file_path = processor_result["file_path"]
            if processor_result.get("file_size"):
                knowledge.file_size = processor_result["file_size"]
            if processor_result.get("mime_type"):
                knowledge.mime_type = processor_result["mime_type"]

            if processor_result.get("file_metadata"):
                knowledge.file_metadata = processor_result["file_metadata"]

            if processor_result.get("tags"):
                # Add AI-generated tags
                from openforge.services.knowledge_service import knowledge_service
                await knowledge_service.update_tags(
                    db, knowledge_id, processor_result["tags"], source="ai"
                )

            knowledge.embedding_status = "done"
            await db.commit()
            extraction_succeeded = True

            logger.info(
                "Knowledge %s processed successfully (type=%s)", knowledge_id, knowledge_type
            )

            # Notify frontend via WebSocket
            await ws_manager.send_to_workspace(
                str(workspace_id),
                {
                    "type": "knowledge_updated",
                    "knowledge_id": str(knowledge_id),
                    "fields": [
                        "content", "ai_title", "ai_summary", "thumbnail_path",
                        "file_metadata", "embedding_status", "tags", "word_count", "title",
                    ],
                },
            )

        except Exception as e:
            logger.error("Processing failed for knowledge %s: %s", knowledge_id, e)
            try:
                knowledge.embedding_status = "failed"
                await db.commit()
            except Exception:
                pass

    # Run knowledge intelligence after extraction so it can use the extracted content.
    # This is done outside the DB session to avoid holding a connection during LLM calls.
    if extraction_succeeded and processor_result.get("content"):
        try:
            from openforge.services.automation_config import is_auto_knowledge_intelligence_enabled
            from openforge.services.knowledge_processing_service import knowledge_processing_service

            async with AsyncSessionLocal() as intelli_db:
                auto_intelligence = await is_auto_knowledge_intelligence_enabled(intelli_db)

            if auto_intelligence:
                await knowledge_processing_service.run_knowledge_intelligence_job(
                    knowledge_id=knowledge_id,
                    workspace_id=workspace_id,
                    audit_task_type="generate_knowledge_intelligence",
                )
        except Exception as intelli_err:
            logger.warning(
                "Post-extraction intelligence failed for knowledge %s: %s",
                knowledge_id,
                intelli_err,
            )


async def _run_processor(
    knowledge_type: str,
    knowledge_id: UUID,
    file_path: str,
    workspace_id: UUID,
    db_session,
) -> dict:
    """Dispatch to the correct processor."""
    if knowledge_type == "image":
        from openforge.core.knowledge_processors.image_processor import image_processor
        return await image_processor.process(knowledge_id, file_path, workspace_id, db_session)
    elif knowledge_type == "audio":
        from openforge.core.knowledge_processors.audio_processor import audio_processor
        return await audio_processor.process(knowledge_id, file_path, workspace_id, db_session)
    elif knowledge_type == "pdf":
        from openforge.core.knowledge_processors.pdf_processor import pdf_processor
        return await pdf_processor.process(knowledge_id, file_path, workspace_id, db_session)
    elif knowledge_type == "document":
        from openforge.core.knowledge_processors.document_processor import document_processor
        return await document_processor.process(knowledge_id, file_path, workspace_id, db_session)
    elif knowledge_type == "sheet":
        from openforge.core.knowledge_processors.sheet_processor import sheet_processor
        return await sheet_processor.process(knowledge_id, file_path, workspace_id, db_session)
    elif knowledge_type == "slides":
        from openforge.core.knowledge_processors.slides_processor import slides_processor
        return await slides_processor.process(knowledge_id, file_path, workspace_id, db_session)
    else:
        logger.warning("No processor for knowledge type: %s", knowledge_type)
        return {}


@router.post("/{workspace_id}/knowledge/{knowledge_id}/reprocess", status_code=202)
async def reprocess_knowledge_file(
    workspace_id: UUID,
    knowledge_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Re-trigger content extraction for an already-uploaded file-based knowledge item."""
    result = await db.execute(
        select(Knowledge).where(
            Knowledge.id == knowledge_id,
            Knowledge.workspace_id == workspace_id,
        )
    )
    knowledge = result.scalar_one_or_none()
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")

    reprocessable_types = {"image", "audio", "pdf", "document", "sheet", "slides"}
    if knowledge.type not in reprocessable_types:
        raise HTTPException(
            status_code=400,
            detail=f"Knowledge type '{knowledge.type}' does not support reprocessing",
        )

    if not knowledge.file_path or not os.path.exists(knowledge.file_path):
        raise HTTPException(status_code=404, detail="Original file not found on disk")

    knowledge.embedding_status = "processing"
    await db.commit()

    background_tasks.add_task(
        _process_knowledge_file,
        knowledge_id=knowledge_id,
        workspace_id=workspace_id,
        knowledge_type=knowledge.type,
        file_path=knowledge.file_path,
    )

    return {"status": "processing", "knowledge_id": str(knowledge_id)}


@router.get("/{workspace_id}/knowledge/{knowledge_id}/file")
async def get_knowledge_file(
    workspace_id: UUID,
    knowledge_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serve the original uploaded file."""
    result = await db.execute(
        select(Knowledge).where(
            Knowledge.id == knowledge_id,
            Knowledge.workspace_id == workspace_id,
        )
    )
    knowledge = result.scalar_one_or_none()
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")

    if not knowledge.file_path or not os.path.exists(knowledge.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=knowledge.file_path,
        media_type=knowledge.mime_type or "application/octet-stream",
        filename=os.path.basename(knowledge.file_path),
    )


@router.get("/{workspace_id}/knowledge/{knowledge_id}/thumbnail")
async def get_knowledge_thumbnail(
    workspace_id: UUID,
    knowledge_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serve the generated thumbnail."""
    result = await db.execute(
        select(Knowledge).where(
            Knowledge.id == knowledge_id,
            Knowledge.workspace_id == workspace_id,
        )
    )
    knowledge = result.scalar_one_or_none()
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")

    if not knowledge.thumbnail_path or not os.path.exists(knowledge.thumbnail_path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(
        path=knowledge.thumbnail_path,
        media_type="image/webp",
    )
