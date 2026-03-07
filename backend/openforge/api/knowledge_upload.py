"""
Knowledge file upload API.

Provides endpoints for uploading files (images, audio, PDF) and processing
them through the appropriate knowledge processors.
"""
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
import logging
import os
from pathlib import Path

from openforge.db.database import get_db
from openforge.db.models import Knowledge
from openforge.config import get_settings
from openforge.core.content_processors import (
    content_processor_registry,
    process_attachment,
)

logger = logging.getLogger("openforge.knowledge_upload")

router = APIRouter()


@router.post("/workspaces/{wid}/knowledge/upload")
async def upload_knowledge(
    wid: UUID,
    file: UploadFile = File,
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
    """
    # Validate MIME type
    type_map = {
        "image/": "image",
        "audio/": "audio",
        "application/pdf": "pdf",
    }
    knowledge_type = None
    for prefix, ktype in type_map.items():
        if file.content_type and file.content_type.startswith(prefix):
            knowledge_type = ktype
            break

    if not knowledge_type:
        raise HTTPException(400, "Unsupported file type")

    # Save file to workspace directory
    settings = get_settings()
    workspace_root = settings.workspace_root
    workspace_dir = Path(workspace_root) / str(wid) / "knowledge"
    workspace_dir.mkdir(parents=True, exist_ok=True)

    file_path = workspace_dir / file.filename
    try:
        # Use UploadFile's built-in method to save with a unique filename
        # in case of conflicts (which shouldn't happen often)
        counter = 1
        while os.path.exists(file_path):
            file_path = workspace_dir / f"{counter}_{file.filename}"
            counter += 1

        # Save file
        with open(file_path, "wb") as f:
            f.write(await file.read())

        # Create knowledge record
        from openforge.schemas.knowledge import KnowledgeCreate
        knowledge_record = Knowledge(
            workspace_id=workspace_id,
            type=knowledge_type,
            title=title,
            content="",
            url=None,
            word_count=0,
            embedding_status="pending",
        )
        db.add(knowledge_record)
        await db.commit()
        await db.refresh(knowledge_record)

        # Queue processing based on type
        process_result = None
        if knowledge_type == "image":
            processor = ImageProcessor()
            try:
                process_result = await processor.process(
                    knowledge_id=knowledge_record.id,
                    file_path=str(file_path),
                    workspace_id=workspace_id,
                    vision_provider_config=vision_provider_config,
                )
                if process_result.success:
                    # Update knowledge with extracted content
                    knowledge_record.content = process_result.extracted_text or process_result.ai_description or ""
                    if process_result.ai_title:
                        knowledge_record.title = process_result.ai_title
                    knowledge_record.word_count = len(process_result.extracted_text.split())
                    await db.commit()
            except Exception as e:
                logger.error(f"Image processing failed: {e}")
        elif knowledge_type == "audio":
            processor = AudioProcessor()
            try:
                process_result = await processor.process(
                    knowledge_id=knowledge_record.id,
                    file_path=str(file_path),
                    workspace_id=workspace_id,
                    whisper_model_size="medium",
                    title_provider_config=title_provider_config,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.ai_title:
                        knowledge_record.title = process_result.ai_title
                    knowledge_record.word_count = len(process_result.extracted_text.split())
                    await db.commit()
            except Exception as e:
                logger.error(f"Audio processing failed: {e}")
        elif knowledge_type == "pdf":
            processor = PDFProcessor()
            try:
                process_result = await processor.process(
                    knowledge_id=knowledge_record.id,
                    file_path=str(file_path),
                    workspace_id=workspace_id,
                )
                if process_result.success:
                    knowledge_record.content = process_result.extracted_text or ""
                    if process_result.ai_title:
                        knowledge_record.title = process_result.ai_title
                    knowledge_record.word_count = len(process_result.extracted_text.split())
                    await db.commit()
            except Exception as e:
                logger.error(f"PDF processing failed: {e}")

        return {
            "id": str(knowledge_record.id),
            "title": knowledge_record.title,
            "type": knowledge_type,
            "filename": file.filename,
            "file_path": str(file_path).replace(str(workspace_root), "/files/"),
            "message": "Knowledge uploaded successfully",
        }
    except Exception as e:
        logger.exception(f"Error uploading knowledge: {e}")
        raise HTTPException(500, f"Failed to process upload: {str(e)}")


async def get_vision_provider_config(db: AsyncSession, workspace_id: UUID) -> dict:
    """Get vision provider config for workspace."""
    # Try to get from workspace config
    from openforge.services.llm_service import llm_service
    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)

    return {
        "provider_id": provider_name,
        "model": model or "gpt-4o-mini",  # Default vision model
        "api_key": api_key,
    }


async def get_title_provider_config(db: AsyncSession, workspace_id: UUID) -> dict:
    """Get title provider config for workspace."""
    # Same as vision provider, just with different default model
    from openforge.services.llm_service import llm_service
    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)

    return {
        "provider_id": provider_name,
        "model": model or "gpt-4o-mini",  # Default
        "api_key": api_key,
    }
