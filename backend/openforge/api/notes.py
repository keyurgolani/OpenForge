from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional
from openforge.db.postgres import get_db
from openforge.services.note_service import note_service
from openforge.schemas.note import (
    NoteCreate, NoteUpdate, NoteResponse, NoteListItem, NoteListParams, NoteTagsUpdate
)

router = APIRouter()


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
    from openforge.services.note_service import NoteService
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
    summary = await llm_gateway.chat(
        messages=[
            {"role": "system", "content": "Summarize the following note concisely. Provide a clear, well-structured summary."},
            {"role": "user", "content": note.content[:8000]},
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
    from openforge.db.models import Note
    from openforge.api.websocket import ws_manager
    from openforge.services.note_service import note_service as ns
    import json

    result = await db.execute(select(Note).where(Note.id == note_id, Note.workspace_id == workspace_id))
    note = result.scalar_one_or_none()
    if not note:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Note not found")

    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
    prompt = """Extract structured insights from this note. Return ONLY valid JSON with this structure:
{
  "todos": ["action item 1", "action item 2"],
  "reminders": ["reminder 1"],
  "deadlines": [{"text": "deadline description", "date": "YYYY-MM-DD or null"}],
  "highlights": ["important point 1", "key insight 2"],
  "tags": ["tag1", "tag2", "tag3"]
}
Return empty arrays if none found. Tags should be lowercase single words or hyphenated phrases."""

    response = await llm_gateway.chat(
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": note.content[:8000]},
        ],
        provider_name=provider_name, api_key=api_key, model=model, base_url=base_url,
    )

    try:
        # Extract JSON from response
        import re
        json_match = re.search(r"\{[\s\S]*\}", response)
        if json_match:
            insights = json.loads(json_match.group())
        else:
            insights = {"todos": [], "reminders": [], "deadlines": [], "highlights": [], "tags": []}
    except Exception:
        insights = {"todos": [], "reminders": [], "deadlines": [], "highlights": [], "tags": []}

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
    title = await llm_gateway.chat(
        messages=[
            {"role": "system", "content": "Generate a concise, descriptive title (max 50 chars). Return ONLY the title, no quotes or explanation."},
            {"role": "user", "content": note.content[:2000]},
        ],
        provider_name=provider_name, api_key=api_key, model=model, base_url=base_url, max_tokens=30,
    )
    note.ai_title = title.strip()[:500]
    await db.commit()
    await ws_manager.send_to_workspace(str(workspace_id), {"type": "note_updated", "note_id": str(note_id), "fields": ["ai_title"]})
    return {"title": note.ai_title}
