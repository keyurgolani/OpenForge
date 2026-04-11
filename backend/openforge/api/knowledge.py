from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone
import json
import logging
import re
from openforge.db.postgres import get_db
from openforge.services.knowledge_service import knowledge_service
from openforge.services.knowledge_processing_service import knowledge_processing_service
from openforge.runtime.input_preparation import build_context_block, prepare_llm_messages
from openforge.runtime.trust_boundaries import ContentSourceType
from openforge.schemas.knowledge import (
    KnowledgeCreate, KnowledgeUpdate, KnowledgeResponse, KnowledgeListItem, KnowledgeListParams, KnowledgeTagsUpdate
)
from openforge.utils.insights import normalize_insights_payload
from openforge.common.text import derive_knowledge_title, normalize_knowledge_title
from openforge.utils.task_audit import (
    mark_task_log_done,
    mark_task_log_failed,
    start_task_log,
)
router = APIRouter()

# Separate router for non-workspace-scoped endpoints
knowledge_global_router = APIRouter()


class KnowledgeResolveRequest(BaseModel):
    ids: list[str]


class KnowledgeResolvedItem(BaseModel):
    id: str
    title: str | None
    type: str | None
    workspace_id: str | None
    workspace_name: str | None


@knowledge_global_router.post("/knowledge/resolve", response_model=list[KnowledgeResolvedItem])
async def resolve_knowledge_ids(body: KnowledgeResolveRequest, db: AsyncSession = Depends(get_db)):
    """Resolve knowledge IDs to their titles, types, and workspace names — cross-workspace."""
    from openforge.db.models import Knowledge, Workspace

    if not body.ids or len(body.ids) > 50:
        return []

    valid_ids = []
    for raw_id in body.ids:
        try:
            valid_ids.append(UUID(raw_id))
        except ValueError:
            continue

    if not valid_ids:
        return []

    result = await db.execute(
        select(
            Knowledge.id,
            Knowledge.title,
            Knowledge.ai_title,
            Knowledge.type,
            Knowledge.workspace_id,
            Workspace.name.label("workspace_name"),
        )
        .join(Workspace, Knowledge.workspace_id == Workspace.id)
        .where(Knowledge.id.in_(valid_ids))
    )
    rows = result.all()

    return [
        KnowledgeResolvedItem(
            id=str(row.id),
            title=row.title or row.ai_title,
            type=row.type,
            workspace_id=str(row.workspace_id),
            workspace_name=row.workspace_name,
        )
        for row in rows
    ]


async def _workspace_prompt_vars(db: AsyncSession, workspace_id: UUID) -> dict[str, str]:
    from openforge.db.models import Workspace

    workspace = await db.get(Workspace, workspace_id)
    return {
        "workspace_name": workspace.name if workspace else "",
        "workspace_description": (workspace.description or "") if workspace else "",
    }


def _knowledge_source_type(knowledge_record) -> ContentSourceType:
    if getattr(knowledge_record, "url", None):
        return ContentSourceType.WEB_CONTENT
    if getattr(knowledge_record, "file_path", None):
        return ContentSourceType.FILE_CONTENT
    return ContentSourceType.RETRIEVED_KNOWLEDGE


def _prepare_knowledge_messages(
    *,
    system_instruction: str,
    knowledge_record,
    content: str,
    conversation_messages: list[dict] | None = None,
    transformation_path: list[str] | None = None,
) -> list[dict]:
    context_blocks = []
    if content.strip():
        context_blocks.append(
            build_context_block(
                label="knowledge_content",
                content=content,
                source_type=_knowledge_source_type(knowledge_record),
                source_id=str(knowledge_record.id),
                transformation_path=transformation_path,
            )
        )
    return prepare_llm_messages(
        system_instruction=system_instruction,
        conversation_messages=conversation_messages,
        context_blocks=context_blocks,
    ).messages


@router.get("/{workspace_id}/knowledge", response_model=dict)
async def list_knowledge(
    workspace_id: UUID,
    type: Optional[str] = None,
    tag: Optional[str] = None,
    is_pinned: Optional[bool] = None,
    is_archived: bool = False,
    sort_by: str = "updated_at",
    sort_order: str = "desc",
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    params = KnowledgeListParams(
        type=type,
        tag=tag,
        is_pinned=is_pinned,
        is_archived=is_archived,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    knowledge_items, total = await knowledge_service.list_knowledge(db, workspace_id, params)
    return {
        "knowledge": [k.model_dump() for k in knowledge_items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{workspace_id}/knowledge", response_model=KnowledgeResponse, status_code=201)
async def create_knowledge(
    workspace_id: UUID,
    body: KnowledgeCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    return await knowledge_service.create_knowledge(db, workspace_id, body, background_tasks)


@router.get("/{workspace_id}/knowledge/{knowledge_id}", response_model=KnowledgeResponse)
async def get_knowledge(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await knowledge_service.get_knowledge(db, workspace_id, knowledge_id)


@router.put("/{workspace_id}/knowledge/{knowledge_id}", response_model=KnowledgeResponse)
async def update_knowledge(
    workspace_id: UUID,
    knowledge_id: UUID,
    body: KnowledgeUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from openforge.db.models import Knowledge

    record = await db.get(Knowledge, knowledge_id)

    # Journal immutability enforcement
    if record is not None and record.type == "journal":
        today = datetime.now(timezone.utc).date()
        if record.created_at.date() != today:
            raise HTTPException(
                status_code=403,
                detail="Cannot edit a journal from a previous day. Create a new journal for today.",
            )

    return await knowledge_service.update_knowledge(db, workspace_id, knowledge_id, body, background_tasks)


@router.delete("/{workspace_id}/knowledge/{knowledge_id}", status_code=204)
async def delete_knowledge(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    await knowledge_service.delete_knowledge(db, workspace_id, knowledge_id)


@router.put("/{workspace_id}/knowledge/{knowledge_id}/tags", response_model=KnowledgeResponse)
async def update_tags(
    workspace_id: UUID, knowledge_id: UUID, body: KnowledgeTagsUpdate, db: AsyncSession = Depends(get_db)
):
    return await knowledge_service.update_tags(db, knowledge_id, body.tags, source="user")


@router.put("/{workspace_id}/knowledge/{knowledge_id}/pin", response_model=KnowledgeResponse)
async def toggle_pin(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await knowledge_service.toggle_pin(db, knowledge_id)


@router.put("/{workspace_id}/knowledge/{knowledge_id}/archive", response_model=KnowledgeResponse)
async def toggle_archive(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await knowledge_service.toggle_archive(db, knowledge_id)


@router.post("/{workspace_id}/knowledge/{knowledge_id}/summarize")
async def summarize_knowledge(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.core.llm_gateway import llm_gateway
    from openforge.services.llm_service import llm_service
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from openforge.db.models import Knowledge
    from openforge.api.websocket import ws_manager

    result = await db.execute(
        select(Knowledge)
        .options(selectinload(Knowledge.tags))
        .where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
    )
    knowledge_record = result.scalar_one_or_none()
    if not knowledge_record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Knowledge not found")

    task_log = await start_task_log(
        db,
        task_type="summarize_knowledge",
        workspace_id=workspace_id,
        target_link=f"/w/{workspace_id}/knowledge/{knowledge_id}",
    )

    try:
        from openforge.db.models import Workspace
        from openforge.utils.insights import get_workspace_categories
        provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
        tags_str = ", ".join([t.tag for t in knowledge_record.tags])
        ws_vars = await _workspace_prompt_vars(db, workspace_id)
        workspace = await db.get(Workspace, workspace_id)
        categories = get_workspace_categories(workspace.intelligence_categories if workspace else None)
        summary_cat = next((c for c in categories if c.get("type") == "summary"), None)
        prompt = knowledge_processing_service._build_summary_prompt(
            workspace_name=ws_vars["workspace_name"],
            workspace_description=ws_vars["workspace_description"],
            knowledge_title=normalize_knowledge_title(knowledge_record.title) or "Untitled",
            knowledge_type=knowledge_record.type,
            tags=tags_str,
            summary_category=summary_cat,
        )
        summary = await llm_gateway.chat(
            messages=_prepare_knowledge_messages(
                system_instruction=prompt,
                knowledge_record=knowledge_record,
                content=(knowledge_record.content or "")[:8000],
                conversation_messages=[{"role": "user", "content": "Summarize this content."}],
            ),
            provider_name=provider_name, api_key=api_key, model=model, base_url=base_url,
        )
        knowledge_record.ai_summary = summary
        knowledge_record.embedding_status = "pending"
        mark_task_log_done(task_log, item_count=1)
        await db.commit()
    except Exception as exc:
        mark_task_log_failed(task_log, exc)
        await db.commit()
        raise

    await ws_manager.send_to_workspace(
        str(workspace_id),
        {"type": "knowledge_updated", "knowledge_id": str(knowledge_id), "fields": ["ai_summary", "embedding_status"]},
    )
    await knowledge_service.process_knowledge_background(
        knowledge_id=knowledge_id,
        workspace_id=workspace_id,
        content=knowledge_record.content or "",
        knowledge_type=knowledge_record.type,
        title=normalize_knowledge_title(knowledge_record.title) or normalize_knowledge_title(knowledge_record.ai_title),
    )
    return {"summary": summary}


@router.post("/{workspace_id}/knowledge/{knowledge_id}/extract-insights")
async def extract_insights(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.core.llm_gateway import llm_gateway
    from openforge.services.llm_service import llm_service
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from openforge.db.models import Knowledge
    from openforge.api.websocket import ws_manager

    result = await db.execute(
        select(Knowledge)
        .options(selectinload(Knowledge.tags))
        .where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
    )
    knowledge_record = result.scalar_one_or_none()
    if not knowledge_record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Knowledge not found")

    task_log = await start_task_log(
        db,
        task_type="extract_knowledge_insights",
        workspace_id=workspace_id,
        target_link=f"/w/{workspace_id}/knowledge/{knowledge_id}",
    )

    try:
        from openforge.db.models import Workspace
        from openforge.utils.insights import get_workspace_categories
        provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
        tags_str = ", ".join([t.tag for t in knowledge_record.tags])
        ws_vars = await _workspace_prompt_vars(db, workspace_id)
        workspace = await db.get(Workspace, workspace_id)
        categories = get_workspace_categories(workspace.intelligence_categories if workspace else None)
        prompt = knowledge_processing_service._build_extraction_prompt(
            categories=categories,
            workspace_name=ws_vars["workspace_name"],
            workspace_description=ws_vars["workspace_description"],
            knowledge_title=normalize_knowledge_title(knowledge_record.title) or "Untitled",
            tags=tags_str,
        )

        response = await llm_gateway.chat(
            messages=_prepare_knowledge_messages(
                system_instruction=prompt,
                knowledge_record=knowledge_record,
                content=(knowledge_record.content or "")[:8000],
                conversation_messages=[{"role": "user", "content": "Extract insights from this content."}],
            ),
            provider_name=provider_name, api_key=api_key, model=model, base_url=base_url,
        )

        try:
            json_match = re.search(r"\{[\s\S]*\}", response)
            if json_match:
                parsed = json.loads(json_match.group())
            else:
                parsed = {}
            insights = normalize_insights_payload(parsed, knowledge_record.content or "", categories)
        except Exception:
            insights = normalize_insights_payload({}, knowledge_record.content or "", categories)

        knowledge_record.insights = insights
        knowledge_record.embedding_status = "pending"
        await db.commit()

        # Save AI tags
        if insights.get("tags"):
            await knowledge_service.update_tags(db, knowledge_id, insights["tags"], source="ai")

        mark_task_log_done(task_log, item_count=1)
        await db.commit()
    except Exception as exc:
        mark_task_log_failed(task_log, exc)
        await db.commit()
        raise

    await ws_manager.send_to_workspace(
        str(workspace_id),
        {"type": "knowledge_updated", "knowledge_id": str(knowledge_id), "fields": ["insights", "tags", "embedding_status"]},
    )
    await knowledge_service.process_knowledge_background(
        knowledge_id=knowledge_id,
        workspace_id=workspace_id,
        content=knowledge_record.content or "",
        knowledge_type=knowledge_record.type,
        title=normalize_knowledge_title(knowledge_record.title) or normalize_knowledge_title(knowledge_record.ai_title),
    )
    return insights


@router.post("/{workspace_id}/knowledge/{knowledge_id}/generate-title")
async def generate_title(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.core.llm_gateway import llm_gateway
    from openforge.services.llm_service import llm_service
    from sqlalchemy import select
    from openforge.db.models import Knowledge
    from openforge.api.websocket import ws_manager

    result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id))
    knowledge_record = result.scalar_one_or_none()
    if not knowledge_record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Knowledge not found")

    task_log = await start_task_log(
        db,
        task_type="generate_knowledge_title",
        workspace_id=workspace_id,
        target_link=f"/w/{workspace_id}/knowledge/{knowledge_id}",
    )

    try:
        provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
        ws_vars = await _workspace_prompt_vars(db, workspace_id)
        system_prompt = (
            "You are an expert title writer. Generate a concise, descriptive title "
            "for the given content. Return ONLY the title text, nothing else."
        )
        user_prompt = (
            f"Generate a short, descriptive title for this content."
            f"\nWorkspace: {ws_vars['workspace_name']}"
            + (f" — {ws_vars['workspace_description']}" if ws_vars['workspace_description'] else "")
        )

        title_response = await llm_gateway.chat(
            messages=_prepare_knowledge_messages(
                system_instruction=system_prompt,
                knowledge_record=knowledge_record,
                content=(knowledge_record.content or "")[:2000],
                conversation_messages=[{"role": "user", "content": user_prompt}],
            ),
            provider_name=provider_name, api_key=api_key, model=model, base_url=base_url, max_tokens=30,
        )

        normalized_title = derive_knowledge_title(title_response, knowledge_record.content or "")
        title_was_empty = False
        if normalized_title:
            knowledge_record.ai_title = normalized_title
            title_was_empty = not normalize_knowledge_title(knowledge_record.title)
            if title_was_empty:
                knowledge_record.title = normalized_title

        mark_task_log_done(task_log, item_count=1 if normalized_title else 0)
        await db.commit()
    except Exception as exc:
        mark_task_log_failed(task_log, exc)
        await db.commit()
        raise

    if normalized_title:
        updated_fields = ["ai_title"]
        if title_was_empty:
            updated_fields.append("title")
        await ws_manager.send_to_workspace(
            str(workspace_id),
            {"type": "knowledge_updated", "knowledge_id": str(knowledge_id), "fields": updated_fields},
        )

    return {
        "title": (
            normalized_title
            or normalize_knowledge_title(knowledge_record.title)
            or normalize_knowledge_title(knowledge_record.ai_title)
        )
    }


@router.post("/{workspace_id}/knowledge/{knowledge_id}/generate-intelligence")
async def generate_intelligence(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    # Ensure the knowledge exists and belongs to the workspace before kicking off the job.
    await knowledge_service.get_knowledge(db, workspace_id, knowledge_id)
    result = await knowledge_service.run_knowledge_intelligence_job(
        knowledge_id=knowledge_id,
        workspace_id=workspace_id,
        audit_task_type="generate_knowledge_intelligence",
    )
    return result


@router.post("/{workspace_id}/knowledge/regenerate-intelligence")
async def regenerate_all_intelligence(
    workspace_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.db.models import Workspace
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    from openforge.services.knowledge_processing_service import knowledge_processing_service
    result = await knowledge_processing_service.regenerate_all_intelligence(
        workspace_id=workspace_id,
    )
    return result


@router.post("/{workspace_id}/knowledge/{knowledge_id}/extract-bookmark-content")
async def extract_bookmark_content(
    workspace_id: UUID, knowledge_id: UUID, db: AsyncSession = Depends(get_db)
):
    # Ensure the knowledge exists and belongs to the workspace before kicking off the job.
    await knowledge_service.get_knowledge(db, workspace_id, knowledge_id)
    extracted = await knowledge_service.run_bookmark_content_extraction_job(
        knowledge_id=knowledge_id,
        workspace_id=workspace_id,
        audit_task_type="extract_bookmark_content",
    )
    return {"extracted": extracted}


# ── Bookmark import ─────────────────────────────────────────────────────

logger = logging.getLogger("openforge.knowledge_import")


class BookmarkItem(BaseModel):
    url: str
    title: Optional[str] = None
    tags: list[str] = []
    description: Optional[str] = None
    created_at: Optional[str] = None
    note: Optional[str] = None


class BookmarkImportRequest(BaseModel):
    bookmarks: list[BookmarkItem]


class BookmarkImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


@router.post(
    "/{workspace_id}/knowledge/import/bookmarks",
    response_model=BookmarkImportResponse,
    status_code=200,
)
async def import_bookmarks(
    workspace_id: UUID,
    body: BookmarkImportRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from openforge.db.models import Knowledge, KnowledgeTag, Workspace
    from openforge.utils.text import count_words
    from openforge.services.automation_config import (
        is_auto_bookmark_content_extraction_enabled,
        is_auto_knowledge_intelligence_enabled,
    )

    # Verify workspace exists
    ws_exists = await db.scalar(select(Workspace.id).where(Workspace.id == workspace_id))
    if not ws_exists:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Fetch existing bookmark URLs in this workspace for duplicate detection
    existing_result = await db.execute(
        select(Knowledge.url).where(
            Knowledge.workspace_id == workspace_id,
            Knowledge.type == "bookmark",
            Knowledge.url.isnot(None),
        )
    )
    existing_urls: set[str] = {row[0] for row in existing_result.all()}

    auto_intel = await is_auto_knowledge_intelligence_enabled(db)
    auto_extract = await is_auto_bookmark_content_extraction_enabled(db)

    imported = 0
    skipped = 0
    errors: list[str] = []

    for bookmark in body.bookmarks:
        url = (bookmark.url or "").strip()
        if not url:
            errors.append("Bookmark with empty URL skipped")
            continue

        # Skip duplicates
        if url in existing_urls:
            skipped += 1
            continue

        title = ((bookmark.title or "").strip() or url)[:500]
        content = bookmark.note or bookmark.description or ""
        has_initial_content = bool(content.strip())

        # Parse created_at timestamp if provided
        parsed_created_at = None
        if bookmark.created_at:
            try:
                parsed_created_at = datetime.fromisoformat(bookmark.created_at.replace("Z", "+00:00"))
                if parsed_created_at.tzinfo is None:
                    parsed_created_at = parsed_created_at.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                pass  # fall back to auto-generated timestamp

        initial_embedding_status = (
            "scraping" if not has_initial_content else "pending"
        )

        try:
            knowledge_record = Knowledge(
                workspace_id=workspace_id,
                type="bookmark",
                title=title,
                content=content,
                url=url,
                word_count=count_words(content, knowledge_type="bookmark"),
                embedding_status=initial_embedding_status,
            )
            if parsed_created_at:
                knowledge_record.created_at = parsed_created_at

            db.add(knowledge_record)
            await db.flush()  # get the id without committing

            # Add tags
            for tag in bookmark.tags:
                tag_clean = tag.lower().strip()
                if tag_clean:
                    db.add(KnowledgeTag(
                        knowledge_id=knowledge_record.id,
                        tag=tag_clean,
                        source="user",
                    ))

            existing_urls.add(url)
            imported += 1

            # Schedule background extraction for each bookmark
            if auto_extract:
                background_tasks.add_task(
                    knowledge_service.run_bookmark_content_extraction_job,
                    knowledge_id=knowledge_record.id,
                    workspace_id=workspace_id,
                    audit_task_type="extract_bookmark_content",
                    trigger_intelligence_after_extract=auto_intel and not has_initial_content,
                )
            elif has_initial_content and auto_intel:
                background_tasks.add_task(
                    knowledge_service.run_knowledge_intelligence_job,
                    knowledge_id=knowledge_record.id,
                    workspace_id=workspace_id,
                    audit_task_type="generate_knowledge_intelligence",
                )

        except Exception as exc:
            logger.warning("Failed to import bookmark %s: %s", url, exc)
            errors.append(f"Failed to import {url}: {str(exc)}")

    await db.commit()

    return BookmarkImportResponse(imported=imported, skipped=skipped, errors=errors)
