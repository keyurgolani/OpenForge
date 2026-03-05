from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from uuid import UUID
from datetime import datetime, timezone
import logging

from openforge.db.models import Note, NoteTag
from openforge.db.qdrant_client import get_qdrant
from openforge.schemas.note import NoteCreate, NoteUpdate, NoteResponse, NoteListItem, NoteListParams
from openforge.config import get_settings
from openforge.utils.text import count_words, truncate_text, strip_markdown
from openforge.utils.title import normalize_note_title
from fastapi import HTTPException, BackgroundTasks
from qdrant_client.models import Filter, FieldCondition, MatchValue

logger = logging.getLogger("openforge.note_service")


def _tags_from_note(note: Note) -> list[str]:
    return [t.tag for t in note.tags]


def _to_response(note: Note) -> NoteResponse:
    return NoteResponse(
        id=note.id,
        workspace_id=note.workspace_id,
        type=note.type,
        title=normalize_note_title(note.title),
        content=note.content,
        url=note.url,
        url_title=note.url_title,
        url_description=note.url_description,
        gist_language=note.gist_language,
        is_pinned=note.is_pinned,
        is_archived=note.is_archived,
        insights=note.insights,
        ai_title=note.ai_title,
        ai_summary=note.ai_summary,
        embedding_status=note.embedding_status,
        word_count=note.word_count,
        tags=_tags_from_note(note),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _to_list_item(note: Note) -> NoteListItem:
    preview = truncate_text(note.content, 200)
    insights_count = None
    if note.insights:
        count = 0
        for k in [
            "tasks",
            "timelines",
            "facts",
            "crucial_things",
            # legacy keys (kept for backward compatibility)
            "todos",
            "reminders",
            "deadlines",
            "highlights",
        ]:
            value = note.insights.get(k, [])
            if isinstance(value, list):
                count += len(value)
        insights_count = count

    return NoteListItem(
        id=note.id,
        workspace_id=note.workspace_id,
        type=note.type,
        title=normalize_note_title(note.title),
        content_preview=preview,
        tags=_tags_from_note(note),
        is_pinned=note.is_pinned,
        is_archived=note.is_archived,
        word_count=note.word_count,
        embedding_status=note.embedding_status,
        insights=note.insights,
        insights_count=insights_count,
        ai_title=note.ai_title,
        url=note.url,
        url_title=note.url_title,
        gist_language=note.gist_language,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


class NoteService:
    async def create_note(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        data: NoteCreate,
        background_tasks: BackgroundTasks,
    ) -> NoteResponse:
        normalized_title = normalize_note_title(data.title)

        note = Note(
            workspace_id=workspace_id,
            type=data.type,
            title=normalized_title,
            content=data.content,
            url=data.url,
            gist_language=data.gist_language,
            word_count=count_words(data.content, note_type=data.type),
            embedding_status="pending",
        )
        db.add(note)
        await db.commit()
        await db.refresh(note, ["tags"])

        # Schedule background embedding
        if data.content and len(data.content.strip()) > 20:
            background_tasks.add_task(
                self._process_note_background,
                note_id=note.id,
                workspace_id=workspace_id,
                content=data.content,
                note_type=data.type,
                title=normalized_title,
            )

        if data.type == "bookmark" and data.url:
            background_tasks.add_task(self._fetch_url_metadata, note_id=note.id, url=data.url, workspace_id=workspace_id)

        return _to_response(note)

    async def list_notes(
        self, db: AsyncSession, workspace_id: UUID, params: NoteListParams
    ) -> tuple[list[NoteListItem], int]:
        from sqlalchemy.orm import selectinload

        query = select(Note).options(selectinload(Note.tags)).where(
            Note.workspace_id == workspace_id,
            Note.is_archived == params.is_archived,
        )

        if params.type:
            query = query.where(Note.type == params.type)
        if params.is_pinned is not None:
            query = query.where(Note.is_pinned == params.is_pinned)
        if params.tag:
            tag_subq = select(NoteTag.note_id).where(NoteTag.tag == params.tag)
            query = query.where(Note.id.in_(tag_subq))

        # Sort
        sort_col = getattr(Note, params.sort_by, Note.updated_at)
        if params.sort_order == "asc":
            query = query.order_by(Note.is_pinned.desc(), sort_col.asc())
        else:
            query = query.order_by(Note.is_pinned.desc(), sort_col.desc())

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        offset = (params.page - 1) * params.page_size
        query = query.offset(offset).limit(params.page_size)
        result = await db.execute(query)
        notes = result.scalars().all()

        return [_to_list_item(n) for n in notes], total

    async def get_note(self, db: AsyncSession, workspace_id: UUID, note_id: UUID) -> NoteResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Note).options(selectinload(Note.tags)).where(
                Note.id == note_id, Note.workspace_id == workspace_id
            )
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        return _to_response(note)

    async def update_note(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        note_id: UUID,
        data: NoteUpdate,
        background_tasks: BackgroundTasks,
    ) -> NoteResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Note).options(selectinload(Note.tags)).where(
                Note.id == note_id, Note.workspace_id == workspace_id
            )
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        content_changed = False
        if data.title is not None:
            note.title = normalize_note_title(data.title)
        if data.content is not None and data.content != note.content:
            note.content = data.content
            note.word_count = count_words(data.content, note_type=note.type)
            note.embedding_status = "pending"
            content_changed = True
        if data.url is not None:
            note.url = data.url
        if data.gist_language is not None:
            note.gist_language = data.gist_language
        if data.is_pinned is not None:
            note.is_pinned = data.is_pinned
        if data.is_archived is not None:
            note.is_archived = data.is_archived

        note.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(note, ["tags"])

        if content_changed and note.content and len(note.content.strip()) > 20:
            background_tasks.add_task(
                self._process_note_background,
                note_id=note.id,
                workspace_id=workspace_id,
                content=note.content,
                note_type=note.type,
                title=normalize_note_title(note.title),
            )

        return _to_response(note)

    async def delete_note(self, db: AsyncSession, workspace_id: UUID, note_id: UUID):
        settings = get_settings()
        result = await db.execute(
            select(Note).where(Note.id == note_id, Note.workspace_id == workspace_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        await db.delete(note)
        await db.commit()

        # Remove Qdrant vectors
        try:
            client = get_qdrant()
            client.delete(
                collection_name=settings.qdrant_collection,
                points_selector=Filter(
                    must=[FieldCondition(key="note_id", match=MatchValue(value=str(note_id)))]
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to delete Qdrant vectors for note {note_id}: {e}")

    async def update_tags(
        self, db: AsyncSession, note_id: UUID, tags: list[str], source: str = "user"
    ) -> NoteResponse:
        from sqlalchemy.orm import selectinload
        # Delete existing tags for this source
        await db.execute(
            delete(NoteTag).where(NoteTag.note_id == note_id, NoteTag.source == source)
        )
        # Add new tags
        for tag in tags:
            db.add(NoteTag(note_id=note_id, tag=tag.lower().strip(), source=source))
        await db.commit()

        result = await db.execute(
            select(Note).options(selectinload(Note.tags)).where(Note.id == note_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        return _to_response(note)

    async def toggle_pin(self, db: AsyncSession, note_id: UUID) -> NoteResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(select(Note).options(selectinload(Note.tags)).where(Note.id == note_id))
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        note.is_pinned = not note.is_pinned
        await db.commit()
        await db.refresh(note, ["tags"])
        return _to_response(note)

    async def toggle_archive(self, db: AsyncSession, note_id: UUID) -> NoteResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(select(Note).options(selectinload(Note.tags)).where(Note.id == note_id))
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        note.is_archived = not note.is_archived
        await db.commit()
        await db.refresh(note, ["tags"])
        return _to_response(note)

    async def _process_note_background(
        self,
        note_id: UUID,
        workspace_id: UUID,
        content: str,
        note_type: str,
        title: str | None,
    ):
        """Background task: embed note, generate AI title, update status."""
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.api.websocket import ws_manager

        embedding_status = "done"

        try:
            from openforge.core.note_processor import note_processor

            tags = []
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(NoteTag).where(NoteTag.note_id == note_id))
                tags = [t.tag for t in result.scalars().all()]

            await note_processor.process_note(
                note_id=note_id,
                workspace_id=workspace_id,
                content=content,
                note_type=note_type,
                title=title,
                tags=tags,
            )
        except Exception as e:
            embedding_status = "failed"
            logger.error(f"Embedding pipeline failed for note {note_id}: {e}")

        # Always persist latest embedding status even if title generation fails later.
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Note).where(Note.id == note_id))
                note = result.scalar_one_or_none()
                if note:
                    note.embedding_status = embedding_status
                    await db.commit()
        except Exception as e:
            logger.warning(f"Failed to update embedding status for note {note_id}: {e}")

        # Auto-generate AI title even if embedding fails.
        if not title and content and len(content.strip()) > 50:
            try:
                from openforge.core.llm_gateway import llm_gateway
                from openforge.services.llm_service import llm_service
                async with AsyncSessionLocal() as db:
                    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
                    generated = await llm_gateway.chat(
                        messages=[
                            {"role": "system", "content": "Generate a concise, descriptive title (max 60 chars). Return ONLY the title, no quotes or extra text."},
                            {"role": "user", "content": content[:2000]},
                        ],
                        provider_name=provider_name, api_key=api_key, model=model, base_url=base_url, max_tokens=30,
                    )

                    result = await db.execute(select(Note).where(Note.id == note_id))
                    note = result.scalar_one_or_none()
                    normalized = normalize_note_title((generated or "").strip().strip('"\''))
                    if note and normalized:
                        note.ai_title = normalized
                        if not normalize_note_title(note.title):
                            note.title = normalized
                        await db.commit()
            except Exception as e:
                logger.warning(f"Auto-title generation failed for note {note_id}: {e}")

        try:
            await ws_manager.send_to_workspace(
                str(workspace_id),
                {"type": "note_updated", "note_id": str(note_id), "fields": ["embedding_status", "ai_title", "title"]},
            )
        except Exception as e:
            logger.warning(f"Failed to emit workspace update for note {note_id}: {e}")

    async def _fetch_url_metadata(self, note_id: UUID, url: str, workspace_id: UUID | None = None):
        """Background task: fetch URL title, description, and readable content for bookmarks."""
        try:
            import httpx
            from openforge.db.postgres import AsyncSessionLocal
            async with httpx.AsyncClient(
                timeout=15.0,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://github.com/openforge)"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()

            import re
            html = resp.text

            # Extract title
            title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
            # Extract meta description
            desc_match = re.search(
                r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
                html, re.IGNORECASE,
            ) or re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
                html, re.IGNORECASE,
            )
            # Extract OG description as fallback
            og_desc_match = re.search(
                r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
                html, re.IGNORECASE,
            )

            # Extract readable text from body — strip tags, collapse whitespace
            body_match = re.search(r"<body[^>]*>(.*?)</body>", html, re.IGNORECASE | re.DOTALL)
            readable_text = ""
            if body_match:
                body_html = body_match.group(1)
                # Remove script/style blocks
                body_html = re.sub(r"<(script|style|nav|footer|header)[^>]*>.*?</\1>", "", body_html, flags=re.IGNORECASE | re.DOTALL)
                # Strip remaining tags
                text = re.sub(r"<[^>]+>", " ", body_html)
                # Normalize whitespace
                text = re.sub(r"\s+", " ", text).strip()
                readable_text = text[:8000]  # cap at 8k chars

            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Note).where(Note.id == note_id))
                note = result.scalar_one_or_none()
                if note:
                    if title_match:
                        note.url_title = title_match.group(1).strip()[:500]
                    desc = (desc_match or og_desc_match)
                    if desc:
                        note.url_description = desc.group(1).strip()[:1000]
                    # Populate note content from scraped text if note has no user-set content
                    if readable_text and not note.content:
                        note.content = readable_text
                        note.word_count = count_words(readable_text, note_type=note.type)
                        note.embedding_status = "pending"
                    await db.commit()

            # Trigger embedding + AI title for the scraped content
            if readable_text and workspace_id:
                from openforge.db.postgres import AsyncSessionLocal as ASL
                async with ASL() as db:
                    result = await db.execute(select(Note).where(Note.id == note_id))
                    note = result.scalar_one_or_none()
                    if note and note.content:
                        # Directly await instead of create_task to avoid greenlet/event loop issues
                        await self._process_note_background(
                            note_id=note_id,
                            workspace_id=workspace_id,
                            content=note.content,
                            note_type="bookmark",
                            title=note.title,
                        )
        except Exception as e:
            logger.warning(f"Failed to fetch URL metadata for note {note_id}: {e}")


note_service = NoteService()
