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

from openforge.db.models import Knowledge, KnowledgeTag
from openforge.db.qdrant_client import get_qdrant
from openforge.schemas.knowledge import KnowledgeCreate, KnowledgeUpdate, KnowledgeResponse, KnowledgeListItem, KnowledgeListParams
from openforge.config import get_settings
from openforge.utils.text import count_words, normalize_word_count, truncate_text
from openforge.utils.knowledge_title_generation import derive_knowledge_title
from openforge.utils.title import normalize_knowledge_title
from openforge.utils.insights import normalize_insights_payload
from openforge.utils.task_audit import start_task_log, mark_task_log_done, mark_task_log_failed
from openforge.services.automation_config import (
    is_auto_bookmark_content_extraction_enabled,
    is_auto_knowledge_intelligence_enabled,
)
from fastapi import HTTPException, BackgroundTasks
from qdrant_client.models import Filter, FieldCondition, MatchValue

logger = logging.getLogger("openforge.knowledge_service")


def _tags_from_knowledge(knowledge: Knowledge) -> list[str]:
    return [t.tag for t in knowledge.tags]


def _to_response(knowledge: Knowledge) -> KnowledgeResponse:
    return KnowledgeResponse(
        id=knowledge.id,
        workspace_id=knowledge.workspace_id,
        type=knowledge.type,
        title=normalize_knowledge_title(knowledge.title),
        content=knowledge.content,
        url=knowledge.url,
        url_title=knowledge.url_title,
        url_description=knowledge.url_description,
        gist_language=knowledge.gist_language,
        is_pinned=knowledge.is_pinned,
        is_archived=knowledge.is_archived,
        insights=knowledge.insights,
        ai_title=knowledge.ai_title,
        ai_summary=knowledge.ai_summary,
        embedding_status=knowledge.embedding_status,
        word_count=knowledge.word_count,
        tags=_tags_from_knowledge(knowledge),
        created_at=knowledge.created_at,
        updated_at=knowledge.updated_at,
    )


def _to_list_item(knowledge: Knowledge) -> KnowledgeListItem:
    preview = truncate_text(knowledge.content, 200)
    insights_count = None
    if knowledge.insights:
        count = 0
        for k in [
            "tasks",
            "timelines",
            "facts",
            "crucial_things",
            # Legacy keys retained for parsing older insights payloads
            "todos",
            "reminders",
            "deadlines",
            "highlights",
        ]:
            value = knowledge.insights.get(k, [])
            if isinstance(value, list):
                count += len(value)
        insights_count = count

    return KnowledgeListItem(
        id=knowledge.id,
        workspace_id=knowledge.workspace_id,
        type=knowledge.type,
        title=normalize_knowledge_title(knowledge.title),
        content_preview=preview,
        tags=_tags_from_knowledge(knowledge),
        is_pinned=knowledge.is_pinned,
        is_archived=knowledge.is_archived,
        word_count=knowledge.word_count,
        embedding_status=knowledge.embedding_status,
        insights=knowledge.insights,
        insights_count=insights_count,
        ai_title=knowledge.ai_title,
        url=knowledge.url,
        url_title=knowledge.url_title,
        gist_language=knowledge.gist_language,
        created_at=knowledge.created_at,
        updated_at=knowledge.updated_at,
    )


class KnowledgeProcessingService:
    _BOOKMARK_CONTENT_MAX_CHARS = 8000
    _CHROME_BINARIES = ("google-chrome", "chromium-browser", "chromium")
    _JINA_READER_TIMEOUT_SECONDS = 30
    _MARKDOWN_FILE_EXTENSIONS = (".md", ".markdown", ".mdown", ".mkd")

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
        knowledge_id: UUID,
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
                    target_link=f"/w/{workspace_id}/knowledge/{knowledge_id}",
                )
                await db.commit()
                log_id = task_log.id

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Knowledge).where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
                )
                knowledge_record = result.scalar_one_or_none()
                if not knowledge_record:
                    raise RuntimeError("Knowledge not found")
                if knowledge_record.type != "bookmark":
                    raise RuntimeError("Knowledge is not a bookmark")
                if not (knowledge_record.url or "").strip():
                    raise RuntimeError("Bookmark URL is empty")
                content_before = bool((knowledge_record.content or "").strip())
                url = knowledge_record.url

            await self._fetch_url_metadata(knowledge_id=knowledge_id, url=url, workspace_id=workspace_id)

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Knowledge).where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
                )
                updated_knowledge = result.scalar_one_or_none()
                has_content_after = bool((updated_knowledge.content or "").strip()) if updated_knowledge else False
                if not has_content_after and not content_before:
                    message = "Bookmark content extraction completed without extracted content"
                    logger.warning(
                        "%s for knowledge %s in workspace %s",
                        message,
                        knowledge_id,
                        workspace_id,
                    )
                    await self._finalize_task_log(log_id, error=message)
                    return False

            if trigger_intelligence_after_extract:
                try:
                    await self.run_knowledge_intelligence_job(
                        knowledge_id=knowledge_id,
                        workspace_id=workspace_id,
                        audit_task_type="generate_knowledge_intelligence",
                    )
                except Exception as intelligence_error:
                    logger.warning(
                        "Post-bookmark intelligence generation failed for %s: %s",
                        knowledge_id,
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
        knowledge_id: UUID,
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
                    target_link=f"/w/{workspace_id}/knowledge/{knowledge_id}",
                )
                await db.commit()
                log_id = task_log.id

        try:
            result_payload: dict = {}

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Knowledge)
                    .options(selectinload(Knowledge.tags))
                    .where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
                )
                knowledge_record = result.scalar_one_or_none()
                if not knowledge_record:
                    raise RuntimeError("Knowledge not found")
                if (
                    knowledge_record.type == "bookmark"
                    and not (knowledge_record.content or "").strip()
                    and (knowledge_record.url or "").strip()
                ):
                    await db.commit()
                    await self.run_bookmark_content_extraction_job(
                        knowledge_id=knowledge_id,
                        workspace_id=workspace_id,
                        audit_task_type="extract_bookmark_content" if audit_task_type else None,
                    )

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Knowledge)
                    .options(selectinload(Knowledge.tags))
                    .where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
                )
                knowledge_record = result.scalar_one_or_none()
                if not knowledge_record:
                    raise RuntimeError("Knowledge not found after bookmark extraction")
                if not (knowledge_record.content or "").strip():
                    raise RuntimeError("Knowledge content is empty; intelligence generation skipped")

                provider_name, api_key, model, base_url, _ = await llm_service.get_provider_for_workspace(db, workspace_id)
                tags_str = ", ".join([t.tag for t in knowledge_record.tags])

                title_prompt = await self._get_prompt_text(
                    db,
                    "generate_title",
                    knowledge_content=knowledge_record.content[:2000],
                )
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
                normalized_title = derive_knowledge_title(title_response, knowledge_record.content or "")
                title_was_empty = False
                if normalized_title:
                    knowledge_record.ai_title = normalized_title
                    title_was_empty = not normalize_knowledge_title(knowledge_record.title)
                    if title_was_empty:
                        knowledge_record.title = normalized_title

                insights_prompt = await self._get_prompt_text(
                    db,
                    "extract_insights",
                    knowledge_content=knowledge_record.content[:8000],
                    knowledge_title=normalize_knowledge_title(knowledge_record.title) or "Untitled",
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
                insights_payload = normalize_insights_payload(parsed, knowledge_record.content or "")
                knowledge_record.insights = insights_payload

                summary_prompt = await self._get_prompt_text(
                    db,
                    "summarize_knowledge",
                    knowledge_content=knowledge_record.content[:8000],
                    knowledge_title=normalize_knowledge_title(knowledge_record.title) or "Untitled",
                    knowledge_type=knowledge_record.type,
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
                knowledge_record.ai_summary = summary

                await db.execute(
                    delete(KnowledgeTag).where(KnowledgeTag.knowledge_id == knowledge_id, KnowledgeTag.source == "ai")
                )
                for tag in insights_payload.get("tags", []):
                    normalized_tag = str(tag).strip().lower()
                    if normalized_tag:
                        db.add(KnowledgeTag(knowledge_id=knowledge_id, tag=normalized_tag, source="ai"))

                knowledge_record.embedding_status = "pending"
                embed_content_for_refresh = knowledge_record.content or ""
                embed_knowledge_type_for_refresh = knowledge_record.type
                embed_title_for_refresh = (
                    normalize_knowledge_title(knowledge_record.title)
                    or normalize_knowledge_title(knowledge_record.ai_title)
                )
                await db.commit()
                result_payload = {
                    "title": normalize_knowledge_title(knowledge_record.title),
                    "ai_title": knowledge_record.ai_title,
                    "summary": knowledge_record.ai_summary,
                    "insights": knowledge_record.insights or {},
                    "tags": [str(tag).strip().lower() for tag in insights_payload.get("tags", []) if str(tag).strip()],
                    "embedding_status": knowledge_record.embedding_status,
                }

            await ws_manager.send_to_workspace(
                str(workspace_id),
                {
                    "type": "knowledge_updated",
                    "knowledge_id": str(knowledge_id),
                    "fields": ["ai_title", "title", "insights", "tags", "ai_summary", "embedding_status"],
                },
            )
            await self._process_knowledge_background(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                content=embed_content_for_refresh,
                knowledge_type=embed_knowledge_type_for_refresh,
                title=embed_title_for_refresh,
            )
            await self._finalize_task_log(log_id, item_count=1)
            return result_payload
        except Exception as exc:
            await self._finalize_task_log(log_id, error=exc)
            raise

    async def _backfill_stale_word_counts(self, db: AsyncSession, knowledge_items: list[Knowledge]) -> None:
        changed = False
        for knowledge in knowledge_items:
            normalized_count, is_stale = normalize_word_count(
                stored_word_count=knowledge.word_count,
                text=knowledge.content,
                knowledge_type=knowledge.type,
            )
            if is_stale:
                knowledge.word_count = normalized_count
                changed = True

        if changed:
            await db.commit()

    async def create_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        data: KnowledgeCreate,
        background_tasks: BackgroundTasks,
    ) -> KnowledgeResponse:
        auto_intelligence_enabled = await is_auto_knowledge_intelligence_enabled(db)
        auto_bookmark_extraction_enabled = await is_auto_bookmark_content_extraction_enabled(db)
        normalized_title = normalize_knowledge_title(data.title)
        has_initial_content = bool((data.content or "").strip())
        has_bookmark_url = bool((data.url or "").strip())
        initial_embedding_status = (
            "scraping"
            if data.type == "bookmark" and has_bookmark_url and not has_initial_content
            else "pending"
        )

        knowledge_record = Knowledge(
            workspace_id=workspace_id,
            type=data.type,
            title=normalized_title,
            content=data.content,
            url=data.url,
            gist_language=data.gist_language,
            word_count=count_words(data.content, knowledge_type=data.type),
            embedding_status=initial_embedding_status,
        )
        db.add(knowledge_record)
        await db.commit()
        await db.refresh(knowledge_record, ["tags"])

        # Schedule background embedding
        if has_initial_content and data.content and len(data.content.strip()) > 20:
            background_tasks.add_task(
                self._process_knowledge_background,
                knowledge_id=knowledge_record.id,
                workspace_id=workspace_id,
                content=data.content,
                knowledge_type=data.type,
                title=normalized_title,
            )

        # Schedule intelligence generation for newly created knowledge with initial content.
        if has_initial_content and auto_intelligence_enabled:
            background_tasks.add_task(
                self.run_knowledge_intelligence_job,
                knowledge_id=knowledge_record.id,
                workspace_id=workspace_id,
                audit_task_type="generate_knowledge_intelligence",
            )

        if data.type == "bookmark" and data.url and auto_bookmark_extraction_enabled:
            background_tasks.add_task(
                self.run_bookmark_content_extraction_job,
                knowledge_id=knowledge_record.id,
                workspace_id=workspace_id,
                audit_task_type="extract_bookmark_content",
                trigger_intelligence_after_extract=auto_intelligence_enabled and not has_initial_content,
            )

        return _to_response(knowledge_record)

    async def list_knowledge(
        self, db: AsyncSession, workspace_id: UUID, params: KnowledgeListParams
    ) -> tuple[list[KnowledgeListItem], int]:
        from sqlalchemy.orm import selectinload

        query = select(Knowledge).options(selectinload(Knowledge.tags)).where(
            Knowledge.workspace_id == workspace_id,
            Knowledge.is_archived == params.is_archived,
        )

        if params.type:
            query = query.where(Knowledge.type == params.type)
        if params.is_pinned is not None:
            query = query.where(Knowledge.is_pinned == params.is_pinned)
        if params.tag:
            tag_subq = select(KnowledgeTag.knowledge_id).where(KnowledgeTag.tag == params.tag)
            query = query.where(Knowledge.id.in_(tag_subq))

        # Sort
        sort_col = getattr(Knowledge, params.sort_by, Knowledge.updated_at)
        if params.sort_order == "asc":
            query = query.order_by(Knowledge.is_pinned.desc(), sort_col.asc())
        else:
            query = query.order_by(Knowledge.is_pinned.desc(), sort_col.desc())

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        offset = (params.page - 1) * params.page_size
        query = query.offset(offset).limit(params.page_size)
        result = await db.execute(query)
        knowledge_items = result.scalars().all()
        await self._backfill_stale_word_counts(db, knowledge_items)

        return [_to_list_item(n) for n in knowledge_items], total

    async def get_knowledge(self, db: AsyncSession, workspace_id: UUID, knowledge_id: UUID) -> KnowledgeResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Knowledge).options(selectinload(Knowledge.tags)).where(
                Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id
            )
        )
        knowledge_record = result.scalar_one_or_none()
        if not knowledge_record:
            raise HTTPException(status_code=404, detail="Knowledge not found")
        await self._backfill_stale_word_counts(db, [knowledge_record])
        return _to_response(knowledge_record)

    async def update_knowledge(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        knowledge_id: UUID,
        data: KnowledgeUpdate,
        background_tasks: BackgroundTasks,
    ) -> KnowledgeResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Knowledge).options(selectinload(Knowledge.tags)).where(
                Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id
            )
        )
        knowledge_record = result.scalar_one_or_none()
        if not knowledge_record:
            raise HTTPException(status_code=404, detail="Knowledge not found")

        content_changed = False
        if data.title is not None:
            knowledge_record.title = normalize_knowledge_title(data.title)
        if data.content is not None and data.content != knowledge_record.content:
            knowledge_record.content = data.content
            knowledge_record.word_count = count_words(data.content, knowledge_type=knowledge_record.type)
            knowledge_record.embedding_status = "pending"
            content_changed = True
        if data.url is not None:
            knowledge_record.url = data.url
        if data.gist_language is not None:
            knowledge_record.gist_language = data.gist_language
        if data.is_pinned is not None:
            knowledge_record.is_pinned = data.is_pinned
        if data.is_archived is not None:
            knowledge_record.is_archived = data.is_archived

        knowledge_record.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(knowledge_record, ["tags"])

        if content_changed and knowledge_record.content and len(knowledge_record.content.strip()) > 20:
            background_tasks.add_task(
                self._process_knowledge_background,
                knowledge_id=knowledge_record.id,
                workspace_id=workspace_id,
                content=knowledge_record.content,
                knowledge_type=knowledge_record.type,
                title=normalize_knowledge_title(knowledge_record.title),
            )

        return _to_response(knowledge_record)

    async def delete_knowledge(self, db: AsyncSession, workspace_id: UUID, knowledge_id: UUID):
        settings = get_settings()
        result = await db.execute(
            select(Knowledge).where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
        )
        knowledge_record = result.scalar_one_or_none()
        if not knowledge_record:
            raise HTTPException(status_code=404, detail="Knowledge not found")

        await db.delete(knowledge_record)
        await db.commit()

        # Remove Qdrant vectors
        try:
            client = get_qdrant()
            client.delete(
                collection_name=settings.qdrant_collection,
                points_selector=Filter(
                    must=[FieldCondition(key="knowledge_id", match=MatchValue(value=str(knowledge_id)))]
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to delete Qdrant vectors for knowledge {knowledge_id}: {e}")

    async def update_tags(
        self, db: AsyncSession, knowledge_id: UUID, tags: list[str], source: str = "user"
    ) -> KnowledgeResponse:
        from sqlalchemy.orm import selectinload
        # Delete existing tags for this source
        await db.execute(
            delete(KnowledgeTag).where(KnowledgeTag.knowledge_id == knowledge_id, KnowledgeTag.source == source)
        )
        # Add new tags
        for tag in tags:
            db.add(KnowledgeTag(knowledge_id=knowledge_id, tag=tag.lower().strip(), source=source))
        await db.commit()

        result = await db.execute(
            select(Knowledge).options(selectinload(Knowledge.tags)).where(Knowledge.id == knowledge_id)
        )
        knowledge_record = result.scalar_one_or_none()
        if not knowledge_record:
            raise HTTPException(status_code=404, detail="Knowledge not found")
        return _to_response(knowledge_record)

    async def toggle_pin(self, db: AsyncSession, knowledge_id: UUID) -> KnowledgeResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(select(Knowledge).options(selectinload(Knowledge.tags)).where(Knowledge.id == knowledge_id))
        knowledge_record = result.scalar_one_or_none()
        if not knowledge_record:
            raise HTTPException(status_code=404, detail="Knowledge not found")
        knowledge_record.is_pinned = not knowledge_record.is_pinned
        await db.commit()
        await db.refresh(knowledge_record, ["tags"])
        return _to_response(knowledge_record)

    async def toggle_archive(self, db: AsyncSession, knowledge_id: UUID) -> KnowledgeResponse:
        from sqlalchemy.orm import selectinload
        result = await db.execute(select(Knowledge).options(selectinload(Knowledge.tags)).where(Knowledge.id == knowledge_id))
        knowledge_record = result.scalar_one_or_none()
        if not knowledge_record:
            raise HTTPException(status_code=404, detail="Knowledge not found")
        knowledge_record.is_archived = not knowledge_record.is_archived
        await db.commit()
        await db.refresh(knowledge_record, ["tags"])
        return _to_response(knowledge_record)

    async def _process_knowledge_background(
        self,
        knowledge_id: UUID,
        workspace_id: UUID,
        content: str,
        knowledge_type: str,
        title: str | None,
    ):
        """Background task: embed knowledge and update generated title/status."""
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.api.websocket import ws_manager

        embedding_status = "done"

        try:
            from openforge.core.knowledge_processor import knowledge_processor

            tags = []
            embed_content = content
            embed_knowledge_type = knowledge_type
            embed_title = title
            embed_summary = None
            embed_insights = None
            async with AsyncSessionLocal() as db:
                knowledge_result = await db.execute(
                    select(Knowledge).where(Knowledge.id == knowledge_id, Knowledge.workspace_id == workspace_id)
                )
                current_knowledge = knowledge_result.scalar_one_or_none()
                if current_knowledge:
                    embed_content = current_knowledge.content or content
                    embed_knowledge_type = current_knowledge.type or knowledge_type
                    embed_title = (
                        normalize_knowledge_title(current_knowledge.title)
                        or normalize_knowledge_title(current_knowledge.ai_title)
                        or title
                    )
                    embed_summary = current_knowledge.ai_summary
                    embed_insights = current_knowledge.insights if isinstance(current_knowledge.insights, dict) else None
                result = await db.execute(select(KnowledgeTag).where(KnowledgeTag.knowledge_id == knowledge_id))
                tags = [t.tag for t in result.scalars().all()]

            await knowledge_processor.process_knowledge(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                content=embed_content,
                knowledge_type=embed_knowledge_type,
                title=embed_title,
                tags=tags,
                ai_summary=embed_summary,
                insights=embed_insights,
            )
        except Exception as e:
            embedding_status = "failed"
            logger.error(f"Embedding pipeline failed for knowledge {knowledge_id}: {e}")

        # Always persist latest embedding status even if title generation fails later.
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id))
                knowledge_record = result.scalar_one_or_none()
                if knowledge_record:
                    knowledge_record.embedding_status = embedding_status
                    await db.commit()
        except Exception as e:
            logger.warning(f"Failed to update embedding status for knowledge {knowledge_id}: {e}")

        # Auto-generate AI title even if embedding fails.
        if not title and content and len(content.strip()) > 50:
            try:
                from openforge.core.llm_gateway import llm_gateway
                from openforge.services.llm_service import llm_service
                async with AsyncSessionLocal() as db:
                    provider_name, api_key, model, base_url, _ = await llm_service.get_provider_for_workspace(db, workspace_id)
                    generated = await llm_gateway.chat(
                        messages=[
                            {"role": "system", "content": "Generate a concise, descriptive title (max 60 chars). Return ONLY the title, no quotes or extra text."},
                            {"role": "user", "content": content[:2000]},
                        ],
                        provider_name=provider_name, api_key=api_key, model=model, base_url=base_url, max_tokens=30,
                    )

                    result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id))
                    knowledge_record = result.scalar_one_or_none()
                    normalized = derive_knowledge_title(generated, content)
                    if knowledge_record and normalized:
                        knowledge_record.ai_title = normalized
                        if not normalize_knowledge_title(knowledge_record.title):
                            knowledge_record.title = normalized
                        await db.commit()
            except Exception as e:
                logger.warning(f"Auto-title generation failed for knowledge {knowledge_id}: {e}")

        try:
            await ws_manager.send_to_workspace(
                str(workspace_id),
                {"type": "knowledge_updated", "knowledge_id": str(knowledge_id), "fields": ["embedding_status", "ai_title", "title"]},
            )
        except Exception as e:
            logger.warning(f"Failed to emit workspace update for knowledge {knowledge_id}: {e}")

    async def _fetch_url_metadata(self, knowledge_id: UUID, url: str, workspace_id: UUID | None = None):
        """Background task: fetch URL title, description, and readable content for bookmarks."""
        try:
            import httpx
            from openforge.db.postgres import AsyncSessionLocal
            from openforge.api.websocket import ws_manager

            # Mark bookmark as actively scraping so the UI can show progress immediately.
            if workspace_id:
                try:
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id))
                        knowledge_record = result.scalar_one_or_none()
                        if (
                            knowledge_record
                            and knowledge_record.type == "bookmark"
                            and not (knowledge_record.content or "").strip()
                        ):
                            if knowledge_record.embedding_status != "scraping":
                                knowledge_record.embedding_status = "scraping"
                                await db.commit()
                    await ws_manager.send_to_workspace(
                        str(workspace_id),
                        {"type": "knowledge_updated", "knowledge_id": str(knowledge_id), "fields": ["embedding_status"]},
                    )
                except Exception as e:
                    logger.warning(f"Failed to emit bookmark scraping start for knowledge {knowledge_id}: {e}")

            domain_override_strategy = "none"
            domain_override_content = ""
            raw_markdown_file = ""
            cloudflare_markdown = ""
            raw_html = ""
            jina_reader_markdown = ""

            async with httpx.AsyncClient(
                timeout=15.0,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://github.com/openforge)"},
            ) as client:
                domain_override_strategy, domain_override_content = await self._try_fetch_domain_override_bookmark_content(client, url)
                raw_markdown_file = await self._try_fetch_raw_markdown_file(client, url)
                cloudflare_markdown = await self._try_fetch_cloudflare_markdown(client, url)
                raw_html = await self._try_fetch_html(client, url)

            title, description = self._extract_metadata_from_html(raw_html)
            markdown_from_html = self._convert_html_to_markdown(raw_html)
            if self._looks_like_bot_challenge_text(markdown_from_html):
                logger.info("Bookmark %s HTML conversion looked like a bot challenge page", knowledge_id)
                markdown_from_html = ""

            if (
                not domain_override_content.strip()
                and not raw_markdown_file.strip()
                and not cloudflare_markdown.strip()
                and not markdown_from_html.strip()
            ):
                async with httpx.AsyncClient(
                    timeout=self._JINA_READER_TIMEOUT_SECONDS,
                    follow_redirects=True,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; OpenForge/1.0; +https://github.com/openforge)"},
                ) as client:
                    jina_reader_markdown = await self._try_fetch_jina_reader_markdown(client, url)

            chrome_fallback_text = ""
            if (
                not domain_override_content.strip()
                and not raw_markdown_file.strip()
                and not cloudflare_markdown.strip()
                and not markdown_from_html.strip()
                and not jina_reader_markdown.strip()
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
                ("raw_markdown_file", raw_markdown_file),
                ("cloudflare_markdown", cloudflare_markdown),
                ("html_to_markdown", markdown_from_html),
                ("jina_reader_markdown", jina_reader_markdown),
                ("chrome_readable_text", chrome_fallback_text),
                ("metadata_fallback", metadata_fallback_text),
            ])
            strategy, readable_text = self._pick_bookmark_content(candidates)
            if readable_text:
                readable_text = readable_text[:self._BOOKMARK_CONTENT_MAX_CHARS]
                logger.info("Bookmark %s scraped via %s", knowledge_id, strategy)
            else:
                logger.warning("Bookmark %s scraping produced empty content", knowledge_id)

            changed_fields: list[str] = []
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id))
                knowledge_record = result.scalar_one_or_none()
                if knowledge_record:
                    if title:
                        knowledge_record.url_title = title[:500]
                        changed_fields.append("url_title")
                    if description:
                        knowledge_record.url_description = description[:1000]
                        changed_fields.append("url_description")
                    # Populate content only if the user has not provided content.
                    if readable_text and not knowledge_record.content:
                        knowledge_record.content = readable_text
                        knowledge_record.word_count = count_words(readable_text, knowledge_type=knowledge_record.type)
                        knowledge_record.embedding_status = "pending"
                        changed_fields.extend(["content", "word_count", "embedding_status"])
                    elif not readable_text and knowledge_record.embedding_status == "scraping":
                        # Scraping completed but we could not extract usable content.
                        knowledge_record.embedding_status = "failed"
                        changed_fields.append("embedding_status")
                    await db.commit()

            if workspace_id and changed_fields:
                try:
                    await ws_manager.send_to_workspace(
                        str(workspace_id),
                        {
                            "type": "knowledge_updated",
                            "knowledge_id": str(knowledge_id),
                            "fields": sorted(set(changed_fields)),
                        },
                    )
                except Exception as e:
                    logger.warning(f"Failed to emit bookmark scraping completion for knowledge {knowledge_id}: {e}")

            # Trigger embedding + AI title for the scraped content
            if readable_text and workspace_id:
                from openforge.db.postgres import AsyncSessionLocal as ASL
                async with ASL() as db:
                    result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id))
                    knowledge_record = result.scalar_one_or_none()
                    if knowledge_record and knowledge_record.content:
                        # Directly await instead of create_task to avoid greenlet/event loop issues
                        await self._process_knowledge_background(
                            knowledge_id=knowledge_id,
                            workspace_id=workspace_id,
                            content=knowledge_record.content,
                            knowledge_type="bookmark",
                            title=knowledge_record.title,
                        )
        except Exception as e:
            logger.warning(f"Failed to fetch URL metadata for knowledge {knowledge_id}: {e}")
            if workspace_id:
                try:
                    from openforge.db.postgres import AsyncSessionLocal
                    from openforge.api.websocket import ws_manager

                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Knowledge).where(Knowledge.id == knowledge_id))
                        knowledge_record = result.scalar_one_or_none()
                        if knowledge_record and knowledge_record.embedding_status == "scraping":
                            knowledge_record.embedding_status = "failed"
                            await db.commit()
                    await ws_manager.send_to_workspace(
                        str(workspace_id),
                        {"type": "knowledge_updated", "knowledge_id": str(knowledge_id), "fields": ["embedding_status"]},
                    )
                except Exception as emit_error:
                    logger.warning(f"Failed to emit bookmark scraping failure for knowledge {knowledge_id}: {emit_error}")

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

    def _looks_like_bot_challenge_text(self, text: str) -> bool:
        snippet = (text or "").strip().lower()
        if not snippet:
            return False
        challenge_markers = (
            "security checkpoint",
            "checking your browser",
            "verify you are human",
            "attention required",
            "please stand by",
            "just a moment",
            "enable javascript",
            "human verification",
            "bot verification",
        )
        return any(marker in snippet for marker in challenge_markers)

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

    def _parse_github_blob_file(self, url: str) -> tuple[str, str, str, str] | None:
        parsed = urlparse(url)
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        if len(parts) < 5:
            return None

        owner, repo = parts[0], parts[1]
        if repo.endswith(".git"):
            repo = repo[:-4]
        if parts[2] != "blob":
            return None

        ref = parts[3]
        file_path = "/".join(parts[4:])
        if not owner or not repo or not ref or not file_path:
            return None
        return owner, repo, ref, file_path

    def _is_markdown_readme_path(self, path: str | None) -> bool:
        if not path:
            return False
        filename = (path.split("/")[-1] or "").strip().lower()
        if not filename:
            return False
        if not filename.startswith("readme"):
            return False
        return filename.endswith(self._MARKDOWN_FILE_EXTENSIONS)

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

    async def _try_fetch_github_file_text(
        self,
        client,
        owner: str,
        repo: str,
        *,
        file_path: str,
        ref: str | None,
    ) -> str:
        owner_quoted = quote(owner, safe="")
        repo_quoted = quote(repo, safe="")
        path_quoted = "/".join(quote(seg, safe="") for seg in file_path.split("/") if seg)
        if not path_quoted:
            return ""

        endpoint = f"https://api.github.com/repos/{owner_quoted}/{repo_quoted}/contents/{path_quoted}"
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
                "GitHub file fetch failed for %s/%s (%s, ref=%s): %s",
                owner,
                repo,
                file_path,
                ref or "default",
                response.status_code,
            )
            return ""
        return self._extract_github_readme_text(response)

    def _directory_fallback_chain(self, path: str | None) -> list[str | None]:
        if not path:
            return [None]
        segments = [seg for seg in path.split("/") if seg]
        chain: list[str | None] = ["/".join(segments[:idx]) for idx in range(len(segments), 0, -1)]
        chain.append(None)
        return chain

    async def _extract_github_bookmark_content(self, client, url: str) -> tuple[str, str]:
        blob = self._parse_github_blob_file(url)
        if blob:
            owner, repo, ref, file_path = blob
            if self._is_markdown_readme_path(file_path):
                raw_markdown = await self._try_fetch_github_file_text(
                    client,
                    owner,
                    repo,
                    file_path=file_path,
                    ref=ref,
                )
                if raw_markdown.strip():
                    return "github_blob_readme_markdown", raw_markdown

        parsed = self._parse_github_repo_or_directory(url)
        if not parsed:
            return "none", ""

        owner, repo, ref, directory_path = parsed

        for candidate_directory in self._directory_fallback_chain(directory_path):
            directory_readme = await self._try_fetch_github_readme(
                client,
                owner,
                repo,
                directory_path=candidate_directory,
                ref=ref,
            )
            if directory_readme.strip():
                if candidate_directory is None:
                    return "github_repository_root_readme", directory_readme
                if candidate_directory == directory_path:
                    return "github_directory_readme", directory_readme
                return "github_parent_directory_readme", directory_readme

        if ref:
            # Branch-specific lookup failed. Fall back to default branch while preserving
            # the same innermost-directory-first search order.
            for candidate_directory in self._directory_fallback_chain(directory_path):
                directory_readme = await self._try_fetch_github_readme(
                    client,
                    owner,
                    repo,
                    directory_path=candidate_directory,
                    ref=None,
                )
                if directory_readme.strip():
                    if candidate_directory is None:
                        return "github_repository_root_readme", directory_readme
                    if candidate_directory == directory_path:
                        return "github_directory_readme", directory_readme
                    return "github_parent_directory_readme", directory_readme

        return "none", ""

    def _looks_like_markdown_file_url(self, url: str) -> bool:
        path = (urlparse(url).path or "").strip().lower()
        if not path:
            return False
        return any(path.endswith(ext) for ext in self._MARKDOWN_FILE_EXTENSIONS)

    async def _try_fetch_raw_markdown_file(self, client, url: str) -> str:
        if not self._looks_like_markdown_file_url(url):
            return ""
        try:
            response = await client.get(url, headers={"Accept": "text/markdown, text/plain;q=0.9"})
            if response.status_code >= 400:
                return ""
            text = (response.text or "").strip()
            if not text or self._looks_like_html_response(text):
                return ""
            return text[:self._BOOKMARK_CONTENT_MAX_CHARS]
        except Exception as e:
            logger.warning(f"Raw markdown fetch failed for {url}: {e}")
            return ""

    def _extract_jina_markdown_body(self, text: str) -> str:
        body = (text or "").strip()
        if not body:
            return ""
        marker = "Markdown Content:"
        index = body.find(marker)
        if index >= 0:
            candidate = body[index + len(marker):].strip()
            if candidate:
                return candidate
        return body

    async def _try_fetch_jina_reader_markdown(self, client, url: str) -> str:
        candidates: list[str] = []
        normalized = (url or "").strip()
        if normalized:
            candidates.append(f"https://r.jina.ai/{normalized}")
            if normalized.startswith("https://"):
                candidates.append(f"https://r.jina.ai/http://{normalized.removeprefix('https://')}")
            elif normalized.startswith("http://"):
                candidates.append(f"https://r.jina.ai/{normalized}")

        seen: set[str] = set()
        for reader_url in candidates:
            if not reader_url or reader_url in seen:
                continue
            seen.add(reader_url)
            try:
                response = await client.get(reader_url)
                if response.status_code >= 400:
                    continue
                text = self._extract_jina_markdown_body(response.text)
                if not text or self._looks_like_html_response(text):
                    continue
                return text[:self._BOOKMARK_CONTENT_MAX_CHARS]
            except Exception as e:
                logger.warning(f"Jina reader fetch failed for {url} via {reader_url}: {e}")
                continue
        return ""

    def _pick_bookmark_content(
        self,
        candidates: list[tuple[str, str]],
    ) -> tuple[str, str]:
        for strategy, content in candidates:
            text = (content or "").strip()
            if text:
                return strategy, text
        return "none", ""

knowledge_processing_service = KnowledgeProcessingService()
