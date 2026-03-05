"""
Tasks API — scheduled background task management + audit log.

Task schedules are stored in the Config table under keys like 'schedule.{task_type}'.
Task history is stored in the TaskLog table.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from openforge.db.postgres import get_db
from openforge.db.models import Config, TaskLog
from typing import Optional
from uuid import UUID
from datetime import datetime

router = APIRouter()

# ── Task type catalogue ────────────────────────────────────────────────────
TASK_CATALOGUE = [
    {
        "id": "embed_notes",
        "label": "Embed Notes",
        "description": "Re-embed all pending notes into the vector store for semantic search.",
        "category": "indexing",
        "default_enabled": True,
        "default_interval_hours": 1,
    },
    {
        "id": "generate_titles",
        "label": "Generate AI Titles",
        "description": "Auto-generate titles for notes that have content but no user-set title.",
        "category": "intelligence",
        "default_enabled": True,
        "default_interval_hours": 6,
    },
    {
        "id": "extract_insights",
        "label": "Extract Insights",
        "description": "Periodically run insight extraction (todos, highlights, tags) on new notes.",
        "category": "intelligence",
        "default_enabled": False,
        "default_interval_hours": 24,
    },
    {
        "id": "scrape_bookmarks",
        "label": "Scrape Bookmarks",
        "description": "Retry failed or pending bookmark URL scrapes to fetch content and metadata.",
        "category": "indexing",
        "default_enabled": True,
        "default_interval_hours": 12,
    },
    {
        "id": "cleanup_embeddings",
        "label": "Clean Up Embeddings",
        "description": "Remove orphaned Qdrant vectors for deleted notes.",
        "category": "maintenance",
        "default_enabled": False,
        "default_interval_hours": 168,  # weekly
    },
]


class ScheduleOut(BaseModel):
    id: str
    label: str
    description: str
    category: str
    default_enabled: bool
    default_interval_hours: int
    enabled: bool
    interval_hours: int
    last_run: Optional[datetime] = None


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    interval_hours: Optional[int] = None


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
        out.append(ScheduleOut(
            **t,
            enabled=cfg.get("enabled", t["default_enabled"]),
            interval_hours=cfg.get("interval_hours", t["default_interval_hours"]),
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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    key = f"schedule.{task_id}"
    result = await db.execute(select(Config).where(Config.key == key))
    row = result.scalar_one_or_none()

    current = row.value if row else {
        "enabled": entry["default_enabled"],
        "interval_hours": entry["default_interval_hours"],
    }
    if body.enabled is not None:
        current["enabled"] = body.enabled
    if body.interval_hours is not None:
        current["interval_hours"] = body.interval_hours

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
        **entry,
        enabled=current["enabled"],
        interval_hours=current["interval_hours"],
        last_run=last_log.started_at if last_log else None,
    )


@router.post("/schedules/{task_id}/run", response_model=dict)
async def run_task_now(
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a task to run immediately."""
    entry = next((t for t in TASK_CATALOGUE if t["id"] == task_id), None)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    # Create a log entry for the manual run
    log = TaskLog(task_type=task_id, status="running")
    db.add(log)
    await db.commit()
    await db.refresh(log)

    # Run in background (asyncio task)
    import asyncio
    from openforge.db.postgres import AsyncSessionLocal
    from datetime import datetime, timezone

    async def _run():
        from sqlalchemy import select as sel

        start = datetime.now(timezone.utc)
        status = "done"
        error_msg = None
        item_count = 0
        try:
            # Dispatch to appropriate handler
            if task_id == "embed_notes":
                from openforge.db.models import Note
                from openforge.core.note_processor import note_processor
                async with AsyncSessionLocal() as s:
                    r = await s.execute(sel(Note).where(Note.embedding_status == "pending").limit(50))
                    pending = r.scalars().all()
                for note in pending:
                    await note_processor.process_note(
                        note_id=note.id, workspace_id=note.workspace_id,
                        content=note.content, note_type=note.type, title=note.title, tags=[]
                    )
                    async with AsyncSessionLocal() as s:
                        r2 = await s.execute(sel(Note).where(Note.id == note.id))
                        n = r2.scalar_one_or_none()
                        if n:
                            n.embedding_status = "done"
                            await s.commit()
                item_count = len(pending)
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
        )
        for l in logs
    ]
