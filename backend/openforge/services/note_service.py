from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from uuid import UUID
from datetime import datetime, timezone
import asyncio
import logging
import re
import shutil
import base64
import json
from html import unescape
from urllib.parse import urlparse, quote, unquote

from openforge.db.models import Note, NoteTag
from openforge.db.qdrant_client import get_qdrant
from openforge.schemas.note import NoteCreate, NoteUpdate, NoteResponse, NoteListItem, NoteListParams
from openforge.config import get_settings
from openforge.utils.text import count_words, normalize_word_count, truncate_text, strip_markdown
from openforge.utils.note_title_generation import derive_note_title
from openforge.utils.title import normalize_note_title
from openforge.utils.insights import normalize_insights_payload
from openforge.utils.task_audit import start_task_log, mark_task_log_done, mark_task_log_failed
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
    _BOOKMARK_CONTENT_MAX_CHARS = 8000
    _CHROME_BINARIES = ("google-chrome", "chromium-browser", "chromium")

    def __init__(self) -> None:
        # Domain-level content extractors for bookmark scraping.
        # Add new domain overrides here in the future.
        self._domain_bookmark_extractors = {
            "github.com": self._extract_github_bookmark_content,
            "www.github.com": self._extract_github_bookmark_content,
        }

    async def _get_prompt_text(self, db: AsyncSession, prompt_id: str, **kwargs) -> str:
        from openforge.db.models import Config
        from openforge.api.prompts import PROMPT_CATALOGUE

        entry = next((p for p in PROMPT_CATALOGUE if p["id"] == prompt_id), None)
        default_text = entry["default"] if entry else ""

        result = await db.execute(select(Config).where(Config.key == f"prompt.{prompt_id}"))
        row = result.scalar_one_or_none()
        text = row.value.get("text") if row and row.value and "text" in row.value else default_text

        for k, v in kwargs.items():
            text = text.replace(f"{{{k}}}", str(v))
        return text

    async def _finalize_task_log(
        self,
        log_id: UUID | None,
        *,
        item_count: int | None = None,
        error: Exception | str | None = None,
    ) -> None:
        if not log_id:
            return
        from openforge.db.postgres import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            from openforge.db.models import TaskLog
            result = await db.execute(select(TaskLog).where(TaskLog.id == log_id))
            log = result.scalar_one_or_none()
            if not log:
                return
            if error is None:
                mark_task_log_done(log, item_count=item_count)
            else:
                mark_task_log_failed(log, error)
            await db.commit()

    async def run_bookmark_content_extraction_job(
        self,
        *,
        note_id: UUID,
        workspace_id: UUID,
        audit_task_type: str | None = "extract_bookmark_content",
        trigger_intelligence_after_extract: bool = False,
    ) -> bool:
        from openforge.db.postgres import AsyncSessionLocal

        log_id: UUID | None = None
        if audit_task_type:
            async with AsyncSessionLocal() as db:
                task_log = await start_task_log(
                    db,
                    task_type=audit_task_type,
                    workspace_id=workspace_id,
                    target_link=f"/w/{workspace_id}/knowledge/{note_id}",
                )
                await db.commit()
                log_id = task_log.id

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Note).where(Note.id == note_id, Note.workspace_id == workspace_id)
                )
                note = result.scalar_one_or_none()
                if not note:
                    raise RuntimeError("Knowledge not found")
                if note.type != "bookmark":
                    raise RuntimeError("Knowledge is not a bookmark")
                if not (note.url or "").strip():
                    raise RuntimeError("Bookmark URL is empty")
                content_before = bool((note.content or "").strip())
                url = note.url

            await self._fetch_url_metadata(note_id=note_id, url=url, workspace_id=workspace_id)

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Note).where(Note.id == note_id, Note.workspace_id == workspace_id)
                )
                note_after = result.scalar_one_or_none()
                has_content_after = bool((note_after.content or "").strip()) if note_after else False
                if not has_content_after and not content_before:
                    logger.warning(
                        "Bookmark extraction produced no content for note %s in workspace %s",
                        note_id,
                        workspace_id,
                    )
                    await self._finalize_task_log(log_id, item_count=0)
                    return False

            if trigger_intelligence_after_extract:
                try:
                    await self.run_knowledge_intelligence_job(
                        note_id=note_id,
                        workspace_id=workspace_id,
                        audit_task_type="generate_knowledge_intelligence",
                    )
                except Exception as intelligence_error:
                    logger.warning(
                        "Post-bookmark intelligence generation failed for %s: %s",
                        note_id,
                        intelligence_error,
                    )

            await self._finalize_task_log(log_id, item_count=1)
            return True
        except Exception as exc:
            await self._finalize_task_log(log_id, error=exc)
            raise

    async def run_knowledge_intelligence_job(
        self,
        *,
        note_id: UUID,
        workspace_id: UUID,
        audit_task_type: str | None = "generate_knowledge_intelligence",
    ) -> dict:
        from sqlalchemy.orm import selectinload
        from openforge.core.llm_gateway import llm_gateway
        from openforge.services.llm_service import llm_service
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.api.websocket import ws_manager

        log_id: UUID | None = None
        if audit_task_type:
            async with AsyncSessionLocal() as db:
                task_log = await start_task_log(
                    db,
                    task_type=audit_task_type,
                    workspace_id=workspace_id,
                    target_link=f"/w/{workspace_id}/knowledge/{note_id}",
                )
                await db.commit()
                log_id = task_log.id

        try:
            result_payload: dict = {}

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Note)
                    .options(selectinload(Note.tags))
                    .where(Note.id == note_id, Note.workspace_id == workspace_id)
                )
                note = result.scalar_one_or_none()
                if not note:
                    raise RuntimeError("Knowledge not found")
                if note.type == "bookmark" and not (note.content or "").strip() and (note.url or "").strip():
                    await db.commit()
                    await self.run_bookmark_content_extraction_job(
                        note_id=note_id,
                        workspace_id=workspace_id,
                        audit_task_type="extract_bookmark_content" if audit_task_type else None,
                    )

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Note)
                    .options(selectinload(Note.tags))
                    .where(Note.id == note_id, Note.workspace_id == workspace_id)
                )
                note = result.scalar_one_or_none()
                if not note:
                    raise RuntimeError("Knowledge not found after bookmark extraction")
                if not (note.content or "").strip():
                    raise RuntimeError("Knowledge content is empty; intelligence generation skipped")

                provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(db, workspace_id)
                tags_str = ", ".join([t.tag for t in note.tags])

                title_prompt = await self._get_prompt_text(db, "generate_title", note_content=note.content[:2000])
                title_response = await llm_gateway.chat(
                    messages=[
                        {"role": "system", "content": "Generate concise knowledge titles. Return only the title text."},
                        {"role": "user", "content": title_prompt},
                    ],
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                    max_tokens=30,
                )
                normalized_title = derive_note_title(title_response, note.content or "")
                title_was_empty = False
                if normalized_title:
                    note.ai_title = normalized_title
                    title_was_empty = not normalize_note_title(note.title)
                    if title_was_empty:
                        note.title = normalized_title

                insights_prompt = await self._get_prompt_text(
                    db,
                    "extract_insights",
                    note_content=note.content[:8000],
                    note_title=normalize_note_title(note.title) or "Untitled",
                    tags=tags_str,
                )
                insights_response = await llm_gateway.chat(
                    messages=[
                        {"role": "system", "content": insights_prompt},
                    ],
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                )
                try:
                    json_match = re.search(r"\{[\s\S]*\}", insights_response)
                    parsed = json.loads(json_match.group()) if json_match else {}
                except Exception:
                    parsed = {}
                insights_payload = normalize_insights_payload(parsed, note.content or "")
                note.insights = insights_payload

                summary_prompt = await self._get_prompt_text(
                    db,
                    "summarize_note",
                    note_content=note.content[:8000],
                    note_title=normalize_note_title(note.title) or "Untitled",
                    note_type=note.type,
                    tags=tags_str,
                )
                summary = await llm_gateway.chat(
                    messages=[
                        {"role": "system", "content": summary_prompt},
                    ],
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                )
                note.ai_summary = summary

                await db.execute(
                    delete(NoteTag).where(NoteTag.note_id == note_id, NoteTag.source == "ai")
                )
                for tag in insights_payload.get("tags", []):
                    normalized_tag = str(tag).strip().lower()
                    if normalized_tag:
                        db.add(NoteTag(note_id=note_id, tag=normalized_tag, source="ai"))

                note.embedding_status = "pending"
                embed_content_for_refresh = note.content or ""
                embed_note_type_for_refresh = note.type
                embed_title_for_refresh = (
                    normalize_note_title(note.title)
                    or normalize_note_title(note.ai_title)
                )
                await db.commit()
                result_payload = {
                    "title": normalize_note_title(note.title),
                    "ai_title": note.ai_title,
                    "summary": note.ai_summary,
                    "insights": note.insights or {},
                    "tags": [str(tag).strip().lower() for tag in insights_payload.get("tags", []) if str(tag).strip()],
                    "embedding_status": note.embedding_status,
                }

            await ws_manager.send_to_workspace(
                str(workspace_id),
                {
                    "type": "note_updated",
                    "note_id": str(note_id),
                    "fields": ["ai_title", "title", "insights", "tags", "ai_summary", "embedding_status"],
                },
            )
            await self._process_note_background(
                note_id=note_id,
                workspace_id=workspace_id,
                content=embed_content_for_refresh,
                note_type=embed_note_type_for_refresh,
                title=embed_title_for_refresh,
            )
            await self._finalize_task_log(log_id, item_count=1)
            return result_payload
        except Exception as exc:
            await self._finalize_task_log(log_id, error=exc)
            raise

    async def _backfill_stale_word_counts(self, db: AsyncSession, notes: list[Note]) -> None:
        changed = False
        for note in notes:
            normalized_count, is_stale = normalize_word_count(
                stored_word_count=note.word_count,
                text=note.content,
                note_type=note.type,
            )
            if is_stale:
                note.word_count = normalized_count
                changed = True

        if changed:
            await db.commit()

    async def create_note(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        data: NoteCreate,
        background_tasks: BackgroundTasks,
    ) -> NoteResponse:
        normalized_title = normalize_note_title(data.title)
        has_initial_content = bool((data.content or "").strip())
        has_bookmark_url = bool((data.url or "").strip())
        initial_embedding_status = (
            "scraping"
            if data.type == "bookmark" and has_bookmark_url and not has_initial_content
            else "pending"
        )

        note = Note(
            workspace_id=workspace_id,
            type=data.type,
            title=normalized_title,
            content=data.content,
            url=data.url,
            gist_language=data.gist_language,
            word_count=count_words(data.content, note_type=data.type),
            embedding_status=initial_embedding_status,
        )
        db.add(note)
        await db.commit()
        await db.refresh(note, ["tags"])

        # Schedule background embedding
        if has_initial_content and data.content and len(data.content.strip()) > 20:
            background_tasks.add_task(
                self._process_note_background,
                note_id=note.id,
                workspace_id=workspace_id,
                content=data.content,
                note_type=data.type,
                title=normalized_title,
            )

        # Schedule intelligence generation for newly created knowledge with initial content.
        if has_initial_content:
            background_tasks.add_task(
                self.run_knowledge_intelligence_job,
                note_id=note.id,
                workspace_id=workspace_id,
                audit_task_type="generate_knowledge_intelligence",
            )

        if data.type == "bookmark" and data.url:
            background_tasks.add_task(
                self.run_bookmark_content_extraction_job,
                note_id=note.id,
                workspace_id=workspace_id,
                audit_task_type="extract_bookmark_content",
                trigger_intelligence_after_extract=not has_initial_content,
            )

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
        await self._backfill_stale_word_counts(db, notes)

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
        await self._backfill_stale_word_counts(db, [note])
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
            embed_content = content
            embed_note_type = note_type
            embed_title = title
            embed_summary = None
            embed_insights = None
            async with AsyncSessionLocal() as db:
                note_result = await db.execute(
                    select(Note).where(Note.id == note_id, Note.workspace_id == workspace_id)
                )
                current_note = note_result.scalar_one_or_none()
                if current_note:
                    embed_content = current_note.content or content
                    embed_note_type = current_note.type or note_type
                    embed_title = (
                        normalize_note_title(current_note.title)
                        or normalize_note_title(current_note.ai_title)
                        or title
                    )
                    embed_summary = current_note.ai_summary
                    embed_insights = current_note.insights if isinstance(current_note.insights, dict) else None
                result = await db.execute(select(NoteTag).where(NoteTag.note_id == note_id))
                tags = [t.tag for t in result.scalars().all()]

            await note_processor.process_note(
                note_id=note_id,
                workspace_id=workspace_id,
                content=embed_content,
                note_type=embed_note_type,
                title=embed_title,
                tags=tags,
                ai_summary=embed_summary,
                insights=embed_insights,
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
                    normalized = derive_note_title(generated, content)
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
            from openforge.api.websocket import ws_manager

            # Mark bookmark as actively scraping so the UI can show progress immediately.
            if workspace_id:
                try:
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Note).where(Note.id == note_id))
                        note = result.scalar_one_or_none()
                        if note and note.type == "bookmark" and not (note.content or "").strip():
                            if note.embedding_status != "scraping":
                                note.embedding_status = "scraping"
                                await db.commit()
                    await ws_manager.send_to_workspace(
                        str(workspace_id),
                        {"type": "note_updated", "note_id": str(note_id), "fields": ["embedding_status"]},
                    )
                except Exception as e:
                    logger.warning(f"Failed to emit bookmark scraping start for note {note_id}: {e}")

            domain_override_strategy = "none"
            domain_override_content = ""
            cloudflare_markdown = ""
            raw_html = ""

            async with httpx.AsyncClient(
                timeout=15.0,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://github.com/openforge)"},
            ) as client:
                domain_override_strategy, domain_override_content = await self._try_fetch_domain_override_bookmark_content(client, url)
                cloudflare_markdown = await self._try_fetch_cloudflare_markdown(client, url)
                raw_html = await self._try_fetch_html(client, url)

            title, description = self._extract_metadata_from_html(raw_html)
            markdown_from_html = self._convert_html_to_markdown(raw_html)

            chrome_fallback_text = ""
            if (
                not domain_override_content.strip()
                and not cloudflare_markdown.strip()
                and not markdown_from_html.strip()
            ):
                rendered_html = await self._try_fetch_rendered_html_with_chrome(url)
                if rendered_html:
                    chrome_title, chrome_description = self._extract_metadata_from_html(rendered_html)
                    title = title or chrome_title
                    description = description or chrome_description
                    chrome_fallback_text = self._extract_readable_text_from_html(rendered_html)
            metadata_fallback_text = self._build_bookmark_metadata_fallback_text(title, description)

            candidates: list[tuple[str, str]] = []
            if domain_override_content.strip():
                candidates.append((domain_override_strategy, domain_override_content))
            candidates.extend([
                ("cloudflare_markdown", cloudflare_markdown),
                ("html_to_markdown", markdown_from_html),
                ("chrome_readable_text", chrome_fallback_text),
                ("metadata_fallback", metadata_fallback_text),
            ])
            strategy, readable_text = self._pick_bookmark_content(candidates)
            if readable_text:
                readable_text = readable_text[:self._BOOKMARK_CONTENT_MAX_CHARS]
                logger.info("Bookmark %s scraped via %s", note_id, strategy)
            else:
                logger.warning("Bookmark %s scraping produced empty content", note_id)

            changed_fields: list[str] = []
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Note).where(Note.id == note_id))
                note = result.scalar_one_or_none()
                if note:
                    if title:
                        note.url_title = title[:500]
                        changed_fields.append("url_title")
                    if description:
                        note.url_description = description[:1000]
                        changed_fields.append("url_description")
                    # Populate note content from scraped text if note has no user-set content
                    if readable_text and not note.content:
                        note.content = readable_text
                        note.word_count = count_words(readable_text, note_type=note.type)
                        note.embedding_status = "pending"
                        changed_fields.extend(["content", "word_count", "embedding_status"])
                    elif not readable_text and note.embedding_status == "scraping":
                        # Scraping completed but we could not extract usable content.
                        note.embedding_status = "failed"
                        changed_fields.append("embedding_status")
                    await db.commit()

            if workspace_id and changed_fields:
                try:
                    await ws_manager.send_to_workspace(
                        str(workspace_id),
                        {
                            "type": "note_updated",
                            "note_id": str(note_id),
                            "fields": sorted(set(changed_fields)),
                        },
                    )
                except Exception as e:
                    logger.warning(f"Failed to emit bookmark scraping completion for note {note_id}: {e}")

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
            if workspace_id:
                try:
                    from openforge.db.postgres import AsyncSessionLocal
                    from openforge.api.websocket import ws_manager

                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Note).where(Note.id == note_id))
                        note = result.scalar_one_or_none()
                        if note and note.embedding_status == "scraping":
                            note.embedding_status = "failed"
                            await db.commit()
                    await ws_manager.send_to_workspace(
                        str(workspace_id),
                        {"type": "note_updated", "note_id": str(note_id), "fields": ["embedding_status"]},
                    )
                except Exception as emit_error:
                    logger.warning(f"Failed to emit bookmark scraping failure for note {note_id}: {emit_error}")

    def _extract_metadata_from_html(self, html_doc: str) -> tuple[str | None, str | None]:
        if not html_doc:
            return None, None

        title_match = re.search(r"<title[^>]*>(.*?)</title>", html_doc, re.IGNORECASE | re.DOTALL)
        desc_match = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
            html_doc,
            re.IGNORECASE,
        ) or re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
            html_doc,
            re.IGNORECASE,
        ) or re.search(
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
            html_doc,
            re.IGNORECASE,
        )

        title = self._clean_html_fragment(title_match.group(1)) if title_match else None
        description = self._clean_html_fragment(desc_match.group(1)) if desc_match else None
        return (title or None), (description or None)

    def _extract_readable_text_from_html(self, html_doc: str) -> str:
        if not html_doc:
            return ""

        body_match = re.search(r"<body[^>]*>(.*?)</body>", html_doc, re.IGNORECASE | re.DOTALL)
        source_html = body_match.group(1) if body_match else html_doc
        source_html = re.sub(
            r"<(script|style|noscript|nav|footer|header|aside)[^>]*>.*?</\1>",
            "",
            source_html,
            flags=re.IGNORECASE | re.DOTALL,
        )

        text = re.sub(r"<[^>]+>", " ", source_html)
        text = unescape(text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:self._BOOKMARK_CONTENT_MAX_CHARS]

    def _clean_html_fragment(self, fragment: str) -> str:
        if not fragment:
            return ""
        cleaned = re.sub(r"<[^>]+>", " ", fragment)
        cleaned = unescape(cleaned)
        return re.sub(r"\s+", " ", cleaned).strip()

    def _build_bookmark_metadata_fallback_text(
        self, title: str | None, description: str | None
    ) -> str:
        title_text = (title or "").strip()
        description_text = (description or "").strip()
        if not title_text and not description_text:
            return ""
        parts: list[str] = []
        if title_text:
            parts.append(f"# {title_text}")
        if description_text:
            parts.append(description_text)
        return "\n\n".join(parts).strip()

    def _convert_html_to_markdown(self, html_doc: str) -> str:
        if not html_doc:
            return ""

        markdown = re.sub(
            r"(?is)<(script|style|noscript|svg|canvas|iframe)[^>]*>.*?</\1>",
            "",
            html_doc,
        )
        markdown = re.sub(
            r"(?is)<pre[^>]*>(.*?)</pre>",
            lambda m: f"\n```\n{self._clean_html_fragment(m.group(1))}\n```\n",
            markdown,
        )
        markdown = re.sub(
            r"(?is)<code[^>]*>(.*?)</code>",
            lambda m: f"`{self._clean_html_fragment(m.group(1))}`",
            markdown,
        )

        for level in range(1, 7):
            marker = "#" * level
            markdown = re.sub(
                rf"(?is)<h{level}[^>]*>(.*?)</h{level}>",
                lambda m, marker=marker: f"\n{marker} {self._clean_html_fragment(m.group(1))}\n\n",
                markdown,
            )

        markdown = re.sub(
            r'(?is)<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
            lambda m: f"[{self._clean_html_fragment(m.group(2))}]({m.group(1).strip()})",
            markdown,
        )
        markdown = re.sub(
            r"(?is)<li[^>]*>(.*?)</li>",
            lambda m: f"- {self._clean_html_fragment(m.group(1))}\n",
            markdown,
        )
        markdown = re.sub(r"(?is)<br\s*/?>", "\n", markdown)
        markdown = re.sub(
            r"(?is)</?(p|div|section|article|main|header|footer|blockquote|ul|ol|table|thead|tbody|tr|td|th)[^>]*>",
            "\n",
            markdown,
        )
        markdown = re.sub(r"(?is)<[^>]+>", "", markdown)
        markdown = unescape(markdown)
        markdown = re.sub(r"[ \t]+", " ", markdown)
        markdown = re.sub(r"\n{3,}", "\n\n", markdown)
        markdown = "\n".join(line.rstrip() for line in markdown.splitlines())
        return markdown.strip()[:self._BOOKMARK_CONTENT_MAX_CHARS]

    def _looks_like_html_response(self, text: str) -> bool:
        snippet = (text or "").lstrip()[:800].lower()
        if not snippet:
            return False
        if snippet.startswith("<!doctype html") or snippet.startswith("<html"):
            return True
        return any(token in snippet for token in ("<body", "<head", "<div", "<script"))

    async def _try_fetch_cloudflare_markdown(self, client, url: str) -> str:
        """Try Cloudflare's markdown content negotiation first."""
        try:
            response = await client.get(url, headers={"Accept": "text/markdown"})
            if response.status_code >= 400:
                return ""
            text = response.text.strip()
            if not text or self._looks_like_html_response(text):
                return ""
            return text
        except Exception as e:
            logger.warning(f"Cloudflare markdown fetch failed for {url}: {e}")
            return ""

    async def _try_fetch_html(self, client, url: str) -> str:
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response.text
        except Exception as e:
            logger.warning(f"HTML fetch failed for {url}: {e}")
            return ""

    async def _try_fetch_rendered_html_with_chrome(self, url: str) -> str:
        chrome_bin = next((binary for binary in self._CHROME_BINARIES if shutil.which(binary)), None)
        if not chrome_bin:
            return ""

        try:
            process = await asyncio.create_subprocess_exec(
                chrome_bin,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--dump-dom",
                url,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=25)
            except asyncio.TimeoutError:
                process.kill()
                await process.communicate()
                logger.warning(f"Chrome fallback timed out for {url}")
                return ""

            if process.returncode != 0:
                logger.warning(f"Chrome fallback failed for {url}: {stderr.decode('utf-8', errors='ignore')[:300]}")
                return ""

            return stdout.decode("utf-8", errors="ignore")
        except Exception as e:
            logger.warning(f"Chrome fallback failed for {url}: {e}")
            return ""

    async def _try_fetch_domain_override_bookmark_content(self, client, url: str) -> tuple[str, str]:
        hostname = (urlparse(url).hostname or "").lower()
        extractor = self._domain_bookmark_extractors.get(hostname)
        if not extractor:
            return "none", ""
        try:
            return await extractor(client, url)
        except Exception as e:
            logger.warning("Domain bookmark extractor failed for %s (%s): %s", url, hostname, e)
            return "none", ""

    def _parse_github_repo_or_directory(self, url: str) -> tuple[str, str, str | None, str | None] | None:
        parsed = urlparse(url)
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        if len(parts) < 2:
            return None

        owner, repo = parts[0], parts[1]
        if not owner or not repo:
            return None
        if repo.endswith(".git"):
            repo = repo[:-4]

        # Repository root
        if len(parts) == 2:
            return owner, repo, None, None

        # Directory view: /{owner}/{repo}/tree/{ref}/{dir...}
        if len(parts) >= 4 and parts[2] == "tree":
            ref = parts[3]
            directory_path = "/".join(parts[4:]) if len(parts) > 4 else None
            return owner, repo, ref, directory_path

        # Other GitHub pages (issues, pulls, blob, etc.) use default extraction.
        return None

    def _extract_github_readme_text(self, response) -> str:
        text = (response.text or "").strip()
        if not text:
            return ""

        content_type = (response.headers.get("content-type") or "").lower()
        if "application/json" in content_type or text.startswith("{"):
            try:
                payload = response.json()
            except Exception:
                return ""
            encoded = payload.get("content")
            if isinstance(encoded, str) and encoded.strip():
                if payload.get("encoding") == "base64":
                    try:
                        decoded = base64.b64decode(encoded).decode("utf-8", errors="ignore")
                        return decoded.strip()
                    except Exception:
                        return ""
                return encoded.strip()
            return ""

        return text

    async def _try_fetch_github_readme(
        self,
        client,
        owner: str,
        repo: str,
        *,
        directory_path: str | None,
        ref: str | None,
    ) -> str:
        owner_quoted = quote(owner, safe="")
        repo_quoted = quote(repo, safe="")
        endpoint = f"https://api.github.com/repos/{owner_quoted}/{repo_quoted}/readme"

        if directory_path:
            dir_quoted = "/".join(quote(seg, safe="") for seg in directory_path.split("/") if seg)
            if dir_quoted:
                endpoint = f"{endpoint}/{dir_quoted}"

        params = {"ref": ref} if ref else None
        headers = {
            "Accept": "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        response = await client.get(endpoint, headers=headers, params=params)
        if response.status_code == 404:
            return ""
        if response.status_code >= 400:
            logger.info(
                "GitHub README fetch failed for %s/%s (dir=%s, ref=%s): %s",
                owner,
                repo,
                directory_path or ".",
                ref or "default",
                response.status_code,
            )
            return ""
        return self._extract_github_readme_text(response)

    async def _extract_github_bookmark_content(self, client, url: str) -> tuple[str, str]:
        parsed = self._parse_github_repo_or_directory(url)
        if not parsed:
            return "none", ""

        owner, repo, ref, directory_path = parsed

        if directory_path:
            directory_readme = await self._try_fetch_github_readme(
                client,
                owner,
                repo,
                directory_path=directory_path,
                ref=ref,
            )
            if directory_readme.strip():
                return "github_directory_readme", directory_readme

        root_readme = await self._try_fetch_github_readme(
            client,
            owner,
            repo,
            directory_path=None,
            ref=ref,
        )
        if not root_readme.strip() and ref:
            # If the branch-specific README is missing, fall back to default branch root README.
            root_readme = await self._try_fetch_github_readme(
                client,
                owner,
                repo,
                directory_path=None,
                ref=None,
            )

        if root_readme.strip():
            return "github_repository_root_readme", root_readme

        return "none", ""

    def _pick_bookmark_content(
        self,
        candidates: list[tuple[str, str]],
    ) -> tuple[str, str]:
        for strategy, content in candidates:
            text = (content or "").strip()
            if text:
                return strategy, text
        return "none", ""


note_service = NoteService()
