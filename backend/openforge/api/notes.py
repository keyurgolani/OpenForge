from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
import json
import re
from openforge.db.postgres import get_db
from openforge.services.note_service import note_service
from openforge.schemas.note import (
    NoteCreate, NoteUpdate, NoteResponse, NoteListItem, NoteListParams, NoteTagsUpdate
)
from openforge.utils.insights import normalize_insights_payload
from openforge.utils.title_generation import normalize_generated_title
from openforge.utils.title import normalize_note_title

router = APIRouter()

def _normalize_generated_title(raw_response: object) -> str | None:
    return normalize_generated_title(raw_response)


async def _get_prompt(db: AsyncSession, prompt_id: str, **kwargs) -> str:
    from openforge.db.models import Config
    from openforge.api.prompts import PROMPT_CATALOGUE
    from sqlalchemy import select

    entry = next((p for p in PROMPT_CATALOGUE if p["id"] == prompt_id), None)
    default_text = entry["default"] if entry else ""

    result = await db.execute(select(Config).where(Config.key == f"prompt.{prompt_id}"))
    row = result.scalar_one_or_none()
    text = row.value.get("text") if row and row.value and "text" in row.value else default_text

    for k, v in kwargs.items():
        text = text.replace(f"{{{k}}}", str(v))
    return text


@router.get("/{workspace_id}/notes", response_model=dict)
async def list_notes(
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
    params = NoteListParams(
        type=type,
        tag=tag,
        is_pinned=is_pinned,
        is_archived=is_archived,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    notes, total = await note_service.list_notes(db, workspace_id, params)
    return {"notes": [n.model_dump() for n in notes], "total": total, "page": page, "page_size": page_size}


@router.post("/{workspace_id}/notes", response_model=NoteResponse, status_code=201)
async def create_note(
    workspace_id: UUID,
    body: NoteCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    return await note_service.create_note(db, workspace_id, body, background_tasks)


@router.get("/{workspace_id}/notes/{note_id}", response_model=NoteResponse)
async def get_note(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await note_service.get_note(db, workspace_id, note_id)


@router.put("/{workspace_id}/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    workspace_id: UUID,
    note_id: UUID,
    body: NoteUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    return await note_service.update_note(db, workspace_id, note_id, body, background_tasks)


@router.delete("/{workspace_id}/notes/{note_id}", status_code=204)
async def delete_note(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    await note_service.delete_note(db, workspace_id, note_id)


@router.put("/{workspace_id}/notes/{note_id}/tags", response_model=NoteResponse)
async def update_tags(
    workspace_id: UUID, note_id: UUID, body: NoteTagsUpdate, db: AsyncSession = Depends(get_db)
):
    return await note_service.update_tags(db, note_id, body.tags, source="user")


@router.put("/{workspace_id}/notes/{note_id}/pin", response_model=NoteResponse)
async def toggle_pin(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await note_service.toggle_pin(db, note_id)


@router.put("/{workspace_id}/notes/{note_id}/archive", response_model=NoteResponse)
async def toggle_archive(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await note_service.toggle_archive(db, note_id)


@router.post("/{workspace_id}/notes/{note_id}/summarize")
async def summarize_note(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.core.llm_gateway import llm_gateway
    from openforge.services.llm_service import llm_service
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from openforge.db.models import Note
    from openforge.api.websocket import ws_manager

    result = await db.execute(
        select(Note)
        .options(selectinload(Note.tags))
        .where(Note.id == note_id, Note.workspace_id == workspace_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Note not found")

    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
    tags_str = ", ".join([t.tag for t in note.tags])
    prompt = await _get_prompt(
        db, "summarize_note",
        note_content=note.content[:8000],
        note_title=normalize_note_title(note.title) or "Untitled",
        note_type=note.type,
        tags=tags_str
    )
    summary = await llm_gateway.chat(
        messages=[
            {"role": "system", "content": prompt},
        ],
        provider_name=provider_name, api_key=api_key, model=model, base_url=base_url,
    )
    note.ai_summary = summary
    await db.commit()
    await ws_manager.send_to_workspace(str(workspace_id), {"type": "note_updated", "note_id": str(note_id), "fields": ["ai_summary"]})
    return {"summary": summary}


@router.post("/{workspace_id}/notes/{note_id}/extract-insights")
async def extract_insights(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.core.llm_gateway import llm_gateway
    from openforge.services.llm_service import llm_service
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from openforge.db.models import Note
    from openforge.api.websocket import ws_manager
    from openforge.services.note_service import note_service as ns

    result = await db.execute(
        select(Note)
        .options(selectinload(Note.tags))
        .where(Note.id == note_id, Note.workspace_id == workspace_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Note not found")

    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
    tags_str = ", ".join([t.tag for t in note.tags])
    prompt = await _get_prompt(
        db, "extract_insights",
        note_content=note.content[:8000],
        note_title=normalize_note_title(note.title) or "Untitled",
        tags=tags_str
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
        insights = normalize_insights_payload(parsed, note.content or "")
    except Exception:
        insights = normalize_insights_payload({}, note.content or "")

    note.insights = insights
    await db.commit()

    # Save AI tags
    if insights.get("tags"):
        await ns.update_tags(db, note_id, insights["tags"], source="ai")

    await ws_manager.send_to_workspace(str(workspace_id), {"type": "note_updated", "note_id": str(note_id), "fields": ["insights"]})
    return insights


@router.post("/{workspace_id}/notes/{note_id}/generate-title")
async def generate_title(
    workspace_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)
):
    from openforge.core.llm_gateway import llm_gateway
    from openforge.services.llm_service import llm_service
    from sqlalchemy import select
    from openforge.db.models import Note
    from openforge.api.websocket import ws_manager

    result = await db.execute(select(Note).where(Note.id == note_id, Note.workspace_id == workspace_id))
    note = result.scalar_one_or_none()
    if not note:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Note not found")

    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
    prompt = await _get_prompt(db, "generate_title", note_content=note.content[:2000])

    title_response = await llm_gateway.chat(
        messages=[
            {"role": "system", "content": prompt},
        ],
        provider_name=provider_name, api_key=api_key, model=model, base_url=base_url, max_tokens=30,
    )

    normalized_title = _normalize_generated_title(title_response)
    if normalized_title:
        note.ai_title = normalized_title
        title_was_empty = not normalize_note_title(note.title)
        if title_was_empty:
            note.title = normalized_title
        await db.commit()
        updated_fields = ["ai_title"]
        if title_was_empty:
            updated_fields.append("title")
        await ws_manager.send_to_workspace(
            str(workspace_id),
            {"type": "note_updated", "note_id": str(note_id), "fields": updated_fields},
        )

    return {
        "title": (
            normalized_title
            or normalize_note_title(note.title)
            or normalize_note_title(note.ai_title)
        )
    }
