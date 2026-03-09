"""
Tasks API — scheduled background task management + audit log.

Task schedules are stored in the Config table under keys like 'schedule.{task_type}'.
Task history is stored in the TaskLog table.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from openforge.db.postgres import get_db
from openforge.db.models import Config, Knowledge, TaskLog, ToolCallLog
from typing import Optional, Literal
from uuid import UUID
from datetime import datetime

router = APIRouter()

# ── Task type catalogue ────────────────────────────────────────────────────
TASK_CATALOGUE = [
    {
        "id": "embed_knowledge",
        "label": "Embed Knowledge",
        "description": "Re-embed all pending knowledge items into the vector store for semantic search.",
        "category": "indexing",
        "default_enabled": True,
        "default_interval_hours": 1,
        "supports_target_scope": False,
        "default_target_scope": None,
    },
    {
        "id": "generate_knowledge_intelligence",
        "label": "Generate Knowledge Intelligence",
        "description": "Generate title, insights, and summary for knowledge. For bookmarks without content, extract content first.",
        "category": "intelligence",
        "default_enabled": True,
        "default_interval_hours": 6,
        "supports_target_scope": True,
        "default_target_scope": "remaining",
    },
    {
        "id": "extract_bookmark_content",
        "label": "Extract Bookmark Content",
        "description": "Extract bookmark content. Target one bookmark, remaining bookmarks without content, or all bookmarks.",
        "category": "indexing",
        "default_enabled": True,
        "default_interval_hours": 12,
        "supports_target_scope": True,
        "default_target_scope": "remaining",
    },
    {
        "id": "cleanup_embeddings",
        "label": "Clean Up Embeddings",
        "description": "Remove orphaned Qdrant vectors for deleted knowledge items.",
        "category": "maintenance",
        "default_enabled": False,
        "default_interval_hours": 168,  # weekly
        "supports_target_scope": False,
        "default_target_scope": None,
    },
    {
        "id": "purge_chat_trash",
        "label": "Purge Chat Trash",
        "description": "Permanently delete trashed chat threads older than the configured retention window.",
        "category": "maintenance",
        "default_enabled": True,
        "default_interval_hours": 24,
        "supports_target_scope": False,
        "default_target_scope": None,
    },
]

TARGET_SCOPE_VALUES: tuple[str, ...] = ("one", "remaining", "all")


class ScheduleOut(BaseModel):
    id: str
    label: str
    description: str
    category: str
    default_enabled: bool
    default_interval_hours: int
    enabled: bool
    interval_hours: int
    supports_target_scope: bool = False
    target_scope: Optional[str] = None
    knowledge_id: Optional[str] = None
    last_run: Optional[datetime] = None


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    interval_hours: Optional[int] = None
    target_scope: Optional[Literal["one", "remaining", "all"]] = None
    knowledge_id: Optional[UUID] = None


class TaskRunRequest(BaseModel):
    target_scope: Optional[Literal["one", "remaining", "all"]] = None
    workspace_id: Optional[UUID] = None
    knowledge_id: Optional[UUID] = None


class TaskLogOut(BaseModel):
    id: str
    task_type: str
    status: str
    workspace_id: Optional[str] = None
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    item_count: Optional[int] = None
    error_message: Optional[str] = None
    target_link: Optional[str] = None


def _normalize_target_link(
    *,
    external_url: Optional[str],
    workspace_id: Optional[UUID],
    knowledge_id: UUID,
) -> Optional[str]:
    url = (external_url or "").strip()
    if url.startswith("https://") or url.startswith("http://"):
        return url
    if workspace_id:
        return f"/w/{workspace_id}/knowledge/{knowledge_id}"
    return None


async def _resolve_task_target_link(
    db: AsyncSession,
    *,
    task_id: str,
    target_scope: Optional[str],
    knowledge_id: Optional[UUID],
    workspace_id: Optional[UUID],
) -> Optional[str]:
    if target_scope != "one" or not knowledge_id:
        return None
    if task_id not in {"extract_bookmark_content", "generate_knowledge_intelligence"}:
        return None

    stmt = select(Knowledge).where(Knowledge.id == knowledge_id)
    if workspace_id:
        stmt = stmt.where(Knowledge.workspace_id == workspace_id)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        return None

    return _normalize_target_link(
        external_url=record.url,
        workspace_id=record.workspace_id,
        knowledge_id=record.id,
    )


@router.get("/schedules", response_model=list[ScheduleOut])
async def list_schedules(db: AsyncSession = Depends(get_db)):
    """Return all task schedules with current config and last run time."""
    # Fetch all schedule configs
    result = await db.execute(
        select(Config).where(Config.category == "schedule")
    )
    configs: dict[str, dict] = {r.key: r.value for r in result.scalars().all()}

    # Fetch last run time for each task type
    out = []
    for t in TASK_CATALOGUE:
        cfg = configs.get(f"schedule.{t['id']}", {})
        # Get last run from task_logs
        log_result = await db.execute(
            select(TaskLog)
            .where(TaskLog.task_type == t["id"])
            .order_by(desc(TaskLog.started_at))
            .limit(1)
        )
        last_log = log_result.scalar_one_or_none()
        supports_target_scope = bool(t.get("supports_target_scope"))
        default_target_scope = t.get("default_target_scope")
        target_scope = cfg.get("target_scope", default_target_scope) if supports_target_scope else None
        knowledge_id = cfg.get("knowledge_id") if supports_target_scope else None
        out.append(ScheduleOut(
            id=t["id"],
            label=t["label"],
            description=t["description"],
            category=t["category"],
            default_enabled=t["default_enabled"],
            default_interval_hours=t["default_interval_hours"],
            enabled=cfg.get("enabled", t["default_enabled"]),
            interval_hours=cfg.get("interval_hours", t["default_interval_hours"]),
            supports_target_scope=supports_target_scope,
            target_scope=target_scope,
            knowledge_id=knowledge_id,
            last_run=last_log.started_at if last_log else None,
        ))
    return out


@router.put("/schedules/{task_id}", response_model=ScheduleOut)
async def update_schedule(
    task_id: str,
    body: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a task schedule's enabled state or interval."""
    entry = next((t for t in TASK_CATALOGUE if t["id"] == task_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    key = f"schedule.{task_id}"
    result = await db.execute(select(Config).where(Config.key == key))
    row = result.scalar_one_or_none()

    current = dict(row.value or {}) if row and isinstance(row.value, dict) else {
        "enabled": entry["default_enabled"],
        "interval_hours": entry["default_interval_hours"],
        "target_scope": entry.get("default_target_scope"),
    }
    if body.enabled is not None:
        current["enabled"] = body.enabled
    if body.interval_hours is not None:
        current["interval_hours"] = body.interval_hours
    if body.target_scope is not None and entry.get("supports_target_scope"):
        current["target_scope"] = body.target_scope
        if body.target_scope != "one":
            current.pop("knowledge_id", None)
    if body.knowledge_id is not None and entry.get("supports_target_scope"):
        current["knowledge_id"] = str(body.knowledge_id)
    if entry.get("supports_target_scope") and current.get("target_scope") == "one" and not current.get("knowledge_id"):
        raise HTTPException(
            status_code=400,
            detail="target_scope='one' requires knowledge_id in schedule configuration",
        )

    if row:
        row.value = current
    else:
        row = Config(key=key, value=current, category="schedule", sensitive=False)
        db.add(row)
    await db.commit()

    # Get last run
    log_result = await db.execute(
        select(TaskLog).where(TaskLog.task_type == task_id).order_by(desc(TaskLog.started_at)).limit(1)
    )
    last_log = log_result.scalar_one_or_none()

    return ScheduleOut(
        id=entry["id"],
        label=entry["label"],
        description=entry["description"],
        category=entry["category"],
        default_enabled=entry["default_enabled"],
        default_interval_hours=entry["default_interval_hours"],
        enabled=current["enabled"],
        interval_hours=current["interval_hours"],
        supports_target_scope=bool(entry.get("supports_target_scope")),
        target_scope=current.get("target_scope"),
        knowledge_id=current.get("knowledge_id"),
        last_run=last_log.started_at if last_log else None,
    )


@router.post("/schedules/{task_id}/run", response_model=dict)
async def run_task_now(
    task_id: str,
    body: Optional[TaskRunRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a task to run immediately."""
    entry = next((t for t in TASK_CATALOGUE if t["id"] == task_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    schedule_key = f"schedule.{task_id}"
    cfg_result = await db.execute(select(Config).where(Config.key == schedule_key))
    cfg_row = cfg_result.scalar_one_or_none()
    cfg = cfg_row.value if cfg_row and isinstance(cfg_row.value, dict) else {}

    supports_target_scope = bool(entry.get("supports_target_scope"))
    target_scope = body.target_scope if body else None
    if supports_target_scope and not target_scope:
        target_scope = cfg.get("target_scope") or entry.get("default_target_scope")
    configured_knowledge_id: Optional[UUID] = None
    cfg_knowledge_raw = cfg.get("knowledge_id")
    if cfg_knowledge_raw:
        try:
            configured_knowledge_id = UUID(str(cfg_knowledge_raw))
        except ValueError:
            configured_knowledge_id = None
    run_knowledge_id = body.knowledge_id if body and body.knowledge_id else configured_knowledge_id
    if supports_target_scope and target_scope not in TARGET_SCOPE_VALUES:
        raise HTTPException(
            status_code=400,
            detail=f"Task '{task_id}' requires target_scope in {TARGET_SCOPE_VALUES}",
        )
    if supports_target_scope and target_scope == "one" and not run_knowledge_id:
        raise HTTPException(
            status_code=400,
            detail="target_scope='one' requires knowledge_id (request body or saved schedule config)",
        )

    target_link = await _resolve_task_target_link(
        db,
        task_id=task_id,
        target_scope=target_scope,
        knowledge_id=run_knowledge_id,
        workspace_id=body.workspace_id if body else None,
    )

    # Create a log entry for the manual run
    log = TaskLog(
        task_type=task_id,
        status="running",
        workspace_id=body.workspace_id if body else None,
        target_link=target_link,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    # Run in background (asyncio task)
    import asyncio
    from openforge.db.postgres import AsyncSessionLocal
    from datetime import datetime, timezone

    async def _run():
        from sqlalchemy import select as sel
        from openforge.db.models import Knowledge
        from openforge.services.knowledge_service import knowledge_service

        start = datetime.now(timezone.utc)
        status = "done"
        error_msg = None
        item_count = 0

        def _is_blank(value: Optional[str]) -> bool:
            return not (value or "").strip()

        def _has_insights_payload(insights: object) -> bool:
            if not isinstance(insights, dict):
                return False
            for value in insights.values():
                if isinstance(value, list) and len(value) > 0:
                    return True
            return False

        def _intelligence_missing(knowledge_record: Knowledge) -> bool:
            return (
                _is_blank(knowledge_record.ai_title)
                or _is_blank(knowledge_record.ai_summary)
                or not _has_insights_payload(knowledge_record.insights)
            )

        try:
            # Dispatch to appropriate handler
            if task_id == "embed_knowledge":
                from openforge.core.knowledge_processor import knowledge_processor
                async with AsyncSessionLocal() as s:
                    r = await s.execute(sel(Knowledge).where(Knowledge.embedding_status == "pending").limit(50))
                    pending = r.scalars().all()
                for knowledge_record in pending:
                    await knowledge_processor.process_knowledge(
                        knowledge_id=knowledge_record.id, workspace_id=knowledge_record.workspace_id,
                        content=knowledge_record.content,
                        knowledge_type=knowledge_record.type,
                        title=knowledge_record.title,
                        tags=[],
                        ai_summary=knowledge_record.ai_summary,
                        insights=knowledge_record.insights if isinstance(knowledge_record.insights, dict) else None,
                    )
                    async with AsyncSessionLocal() as s:
                        r2 = await s.execute(sel(Knowledge).where(Knowledge.id == knowledge_record.id))
                        n = r2.scalar_one_or_none()
                        if n:
                            n.embedding_status = "done"
                            await s.commit()
                item_count = len(pending)
            elif task_id == "purge_chat_trash":
                from openforge.services.conversation_service import conversation_service
                async with AsyncSessionLocal() as s:
                    item_count = await conversation_service.purge_expired_archived_conversations(s)
            elif task_id == "extract_bookmark_content":
                failures = 0
                last_failure = None
                workspace_filter = body.workspace_id if body else None
                knowledge_id = run_knowledge_id

                async with AsyncSessionLocal() as s:
                    if target_scope == "one":
                        stmt = sel(Knowledge).where(Knowledge.id == knowledge_id)
                        if workspace_filter:
                            stmt = stmt.where(Knowledge.workspace_id == workspace_filter)
                        result = await s.execute(stmt)
                        record = result.scalar_one_or_none()
                        if not record:
                            raise RuntimeError("Knowledge target not found")
                        if record.type != "bookmark":
                            raise RuntimeError("Knowledge target is not a bookmark")
                        targets = [(record.id, record.workspace_id)]
                    else:
                        stmt = sel(Knowledge).where(
                            Knowledge.type == "bookmark",
                            Knowledge.url.is_not(None),
                        )
                        if workspace_filter:
                            stmt = stmt.where(Knowledge.workspace_id == workspace_filter)
                        result = await s.execute(stmt)
                        records = result.scalars().all()
                        if target_scope == "remaining":
                            records = [n for n in records if _is_blank(n.content)]
                        targets = [(n.id, n.workspace_id) for n in records]

                for target_knowledge_id, target_workspace_id in targets:
                    try:
                        extracted = await knowledge_service.run_bookmark_content_extraction_job(
                            knowledge_id=target_knowledge_id,
                            workspace_id=target_workspace_id,
                            audit_task_type=None,
                        )
                        if extracted:
                            item_count += 1
                        else:
                            failures += 1
                            last_failure = "Bookmark content extraction completed without extracted content"
                    except Exception as exc:
                        failures += 1
                        last_failure = str(exc)

                if failures > 0:
                    status = "failed"
                    error_msg = (
                        f"{failures} bookmark extraction job(s) failed."
                        + (f" Last failure: {last_failure[:240]}" if last_failure else "")
                    )[:500]
            elif task_id == "generate_knowledge_intelligence":
                failures = 0
                last_failure = None
                workspace_filter = body.workspace_id if body else None
                knowledge_id = run_knowledge_id

                async with AsyncSessionLocal() as s:
                    if target_scope == "one":
                        stmt = sel(Knowledge).where(Knowledge.id == knowledge_id)
                        if workspace_filter:
                            stmt = stmt.where(Knowledge.workspace_id == workspace_filter)
                        result = await s.execute(stmt)
                        record = result.scalar_one_or_none()
                        if not record:
                            raise RuntimeError("Knowledge target not found")
                        targets = [(record.id, record.workspace_id)]
                    else:
                        stmt = sel(Knowledge)
                        if workspace_filter:
                            stmt = stmt.where(Knowledge.workspace_id == workspace_filter)
                        result = await s.execute(stmt)
                        records = result.scalars().all()
                        if target_scope == "remaining":
                            records = [n for n in records if _intelligence_missing(n)]
                        targets = [(n.id, n.workspace_id) for n in records]

                for target_knowledge_id, target_workspace_id in targets:
                    try:
                        completed = await knowledge_service.run_knowledge_intelligence_job(
                            knowledge_id=target_knowledge_id,
                            workspace_id=target_workspace_id,
                            audit_task_type=None,
                        )
                        if completed:
                            item_count += 1
                    except Exception as exc:
                        failures += 1
                        last_failure = str(exc)

                if failures > 0:
                    status = "failed"
                    error_msg = (
                        f"{failures} intelligence job(s) failed."
                        + (f" Last failure: {last_failure[:240]}" if last_failure else "")
                    )[:500]
        except Exception as e:
            status = "failed"
            error_msg = str(e)[:500]
        finally:
            end = datetime.now(timezone.utc)
            ms = int((end - start).total_seconds() * 1000)
            async with AsyncSessionLocal() as s:
                r = await s.execute(sel(TaskLog).where(TaskLog.id == log.id))
                entry_log = r.scalar_one_or_none()
                if entry_log:
                    entry_log.status = status
                    entry_log.finished_at = end
                    entry_log.duration_ms = ms
                    entry_log.item_count = item_count
                    entry_log.error_message = error_msg
                    await s.commit()

    asyncio.create_task(_run())
    return {"message": f"Task '{entry['label']}' started", "log_id": str(log.id)}


@router.get("/history", response_model=list[TaskLogOut])
async def get_task_history(
    task_type: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Return recent task execution history."""
    query = select(TaskLog).order_by(desc(TaskLog.started_at)).limit(limit)
    if task_type:
        query = query.where(TaskLog.task_type == task_type)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        TaskLogOut(
            id=str(l.id),
            task_type=l.task_type,
            status=l.status,
            workspace_id=str(l.workspace_id) if l.workspace_id else None,
            started_at=l.started_at,
            finished_at=l.finished_at,
            duration_ms=l.duration_ms,
            item_count=l.item_count,
            error_message=l.error_message,
            target_link=l.target_link,
        )
        for l in logs
    ]


class ToolCallLogOut(BaseModel):
    id: str
    workspace_id: Optional[str] = None
    conversation_id: str
    call_id: str
    tool_name: str
    arguments: Optional[dict] = None
    success: Optional[bool] = None
    output: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    started_at: datetime
    finished_at: Optional[datetime] = None


@router.get("/tool-call-logs", response_model=list[ToolCallLogOut])
async def get_tool_call_logs(
    workspace_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Return recent tool call execution logs."""
    query = select(ToolCallLog).order_by(desc(ToolCallLog.started_at)).limit(limit)
    if workspace_id:
        try:
            query = query.where(ToolCallLog.workspace_id == UUID(workspace_id))
        except ValueError:
            pass
    if tool_name:
        query = query.where(ToolCallLog.tool_name == tool_name)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        ToolCallLogOut(
            id=str(l.id),
            workspace_id=str(l.workspace_id) if l.workspace_id else None,
            conversation_id=str(l.conversation_id),
            call_id=l.call_id,
            tool_name=l.tool_name,
            arguments=l.arguments,
            success=l.success,
            output=l.output,
            error=l.error,
            duration_ms=l.duration_ms,
            started_at=l.started_at,
            finished_at=l.finished_at,
        )
        for l in logs
    ]
