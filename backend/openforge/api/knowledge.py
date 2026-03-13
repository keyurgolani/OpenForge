from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
import json
import re
from openforge.db.postgres import get_db
from openforge.services.knowledge_service import knowledge_service
from openforge.schemas.knowledge import (
    KnowledgeCreate, KnowledgeUpdate, KnowledgeResponse, KnowledgeListItem, KnowledgeListParams, KnowledgeTagsUpdate
)
from openforge.utils.insights import normalize_insights_payload
from openforge.utils.knowledge_title_generation import derive_knowledge_title
from openforge.utils.task_audit import (
    mark_task_log_done,
    mark_task_log_failed,
    start_task_log,
)
from openforge.utils.title import normalize_knowledge_title
from openforge.core.prompt_catalogue import resolve_prompt_text

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
        "workspace_description": workspace.description if workspace else "",
    }


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
        provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
        tags_str = ", ".join([t.tag for t in knowledge_record.tags])
        prompt = await resolve_prompt_text(
            db,
            "summarize_knowledge",
            knowledge_content=knowledge_record.content[:8000],
            knowledge_title=normalize_knowledge_title(knowledge_record.title) or "Untitled",
            knowledge_type=knowledge_record.type,
            tags=tags_str,
            **(await _workspace_prompt_vars(db, workspace_id)),
        )
        summary = await llm_gateway.chat(
            messages=[
                {"role": "system", "content": prompt},
            ],
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
        provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
        tags_str = ", ".join([t.tag for t in knowledge_record.tags])
        prompt = await resolve_prompt_text(
            db,
            "extract_insights",
            knowledge_content=knowledge_record.content[:8000],
            knowledge_title=normalize_knowledge_title(knowledge_record.title) or "Untitled",
            tags=tags_str,
            **(await _workspace_prompt_vars(db, workspace_id)),
        )

        response = await llm_gateway.chat(
            messages=[
                {"role": "system", "content": prompt},
            ],
            provider_name=provider_name, api_key=api_key, model=model, base_url=base_url,
        )

        try:
            # Extract JSON from response
            json_match = re.search(r"\{[\s\S]*\}", response)
            if json_match:
                parsed = json.loads(json_match.group())
            else:
                parsed = {}
            insights = normalize_insights_payload(parsed, knowledge_record.content or "")
        except Exception:
            insights = normalize_insights_payload({}, knowledge_record.content or "")

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
        prompt = await resolve_prompt_text(
            db,
            "generate_title",
            knowledge_content=knowledge_record.content[:2000],
            **(await _workspace_prompt_vars(db, workspace_id)),
        )
        system_prompt = await resolve_prompt_text(db, "knowledge_title_system")

        title_response = await llm_gateway.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
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
