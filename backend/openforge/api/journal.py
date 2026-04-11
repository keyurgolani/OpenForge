"""Journal entry API.

Each journal is a Knowledge record with type="journal". The content column stores
JSON: {"entries": [{"timestamp": "ISO8601", "body": "text"}, ...]}.
The title is auto-generated as the formatted date (e.g. "April 09, 2026").

Immutability rules:
- Entries are editable for 5 minutes after creation.
- The entire journal becomes readonly the next day.
- Adding new entries to today's journal is always allowed.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db

router = APIRouter()
logger = logging.getLogger("openforge.journal")

_EDIT_WINDOW = timedelta(minutes=5)


# ── Response / request models ────────────────────────────────────────────────

class JournalEntryCreate(BaseModel):
    body: str


class JournalEntryUpdate(BaseModel):
    body: str


class JournalEntryResponse(BaseModel):
    timestamp: str
    body: str
    editable: bool


class JournalResponse(BaseModel):
    id: str
    date: str
    entries: list[JournalEntryResponse]
    readonly: bool
    created_at: str
    updated_at: str


# ── Private helpers ───────────────────────────────────────────────────────────

def _parse_journal_entries(content: str | None) -> list[dict]:
    """Parse JSON content into a list of entry dicts. Handle legacy plain text."""
    if not content:
        return []
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "entries" in parsed:
            entries = parsed["entries"]
            if isinstance(entries, list):
                return entries
        # Fallback: treat entire content as a single plain-text entry
        return [{"timestamp": datetime.now(timezone.utc).isoformat(), "body": content}]
    except (json.JSONDecodeError, TypeError):
        # Legacy plain text — wrap it
        return [{"timestamp": datetime.now(timezone.utc).isoformat(), "body": content}]


def _is_entry_editable(timestamp: str) -> bool:
    """Return True if the entry's timestamp is within the 5-minute edit window."""
    try:
        ts = datetime.fromisoformat(timestamp)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts) <= _EDIT_WINDOW
    except (ValueError, TypeError):
        return False


def _is_today(knowledge_record) -> bool:
    """Return True if the journal record was created today (UTC)."""
    created = knowledge_record.created_at
    if created is None:
        return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.date() == datetime.now(timezone.utc).date()


def _serialize_entries(entries: list[dict]) -> str:
    """Serialize entries list to JSON string for storage."""
    return json.dumps({"entries": entries})


def _to_journal_response(record) -> JournalResponse:
    """Convert a Knowledge record to a JournalResponse."""
    entries = _parse_journal_entries(record.content)
    today = _is_today(record)
    readonly = not today

    entry_responses = [
        JournalEntryResponse(
            timestamp=e.get("timestamp", ""),
            body=e.get("body", ""),
            editable=today and _is_entry_editable(e.get("timestamp", "")),
        )
        for e in entries
    ]

    created_at = record.created_at
    updated_at = record.updated_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if updated_at and updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)

    return JournalResponse(
        id=str(record.id),
        date=record.title or "",
        entries=entry_responses,
        readonly=readonly,
        created_at=created_at.isoformat() if created_at else "",
        updated_at=updated_at.isoformat() if updated_at else "",
    )


def _today_title() -> str:
    """Return the formatted date title for today, e.g. 'April 09, 2026'."""
    return datetime.now(timezone.utc).strftime("%B %d, %Y")


async def _get_today_journal(db: AsyncSession, workspace_id: UUID):
    """Return today's journal Knowledge record for the workspace, or None."""
    from openforge.db.models import Knowledge

    title = _today_title()
    result = await db.execute(
        select(Knowledge).where(
            Knowledge.workspace_id == workspace_id,
            Knowledge.type == "journal",
            Knowledge.title == title,
        )
    )
    return result.scalar_one_or_none()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/journal", response_model=list[JournalResponse])
async def list_journals(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return all journal records for the workspace, newest first."""
    from openforge.db.models import Knowledge

    result = await db.execute(
        select(Knowledge)
        .where(
            Knowledge.workspace_id == workspace_id,
            Knowledge.type == "journal",
            Knowledge.is_archived == False,  # noqa: E712
        )
        .order_by(Knowledge.created_at.desc())
    )
    records = result.scalars().all()
    return [_to_journal_response(r) for r in records]


@router.post("/{workspace_id}/journal/entry", response_model=JournalResponse, status_code=201)
async def add_journal_entry(
    workspace_id: UUID,
    body: JournalEntryCreate,
    db: AsyncSession = Depends(get_db),
):
    """Append a timestamped entry to today's journal, creating it if needed."""
    from openforge.db.models import Knowledge

    if not body.body or not body.body.strip():
        raise HTTPException(status_code=422, detail="Entry body cannot be empty.")

    now = datetime.now(timezone.utc)
    new_entry = {"timestamp": now.isoformat(), "body": body.body.strip()}

    record = await _get_today_journal(db, workspace_id)

    if record is None:
        # Create a new journal for today
        title = _today_title()
        content = _serialize_entries([new_entry])
        record = Knowledge(
            workspace_id=workspace_id,
            type="journal",
            title=title,
            content=content,
            word_count=len(body.body.split()),
            embedding_status="pending",
        )
        db.add(record)
        await db.flush()
    else:
        # Append to existing journal
        entries = _parse_journal_entries(record.content)
        entries.append(new_entry)
        record.content = _serialize_entries(entries)
        record.word_count = sum(len(e.get("body", "").split()) for e in entries)

    await db.commit()
    await db.refresh(record)
    return _to_journal_response(record)


@router.get("/{workspace_id}/journal/today", response_model=JournalResponse | None)
async def get_today_journal(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return today's journal if it exists, else null."""
    record = await _get_today_journal(db, workspace_id)
    if record is None:
        return None
    return _to_journal_response(record)


@router.put(
    "/{workspace_id}/journal/{knowledge_id}/entry/{entry_index}",
    response_model=JournalResponse,
)
async def update_journal_entry(
    workspace_id: UUID,
    knowledge_id: UUID,
    entry_index: int,
    body: JournalEntryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a specific entry by index, subject to the 5-minute edit window and same-day restriction."""
    from openforge.db.models import Knowledge

    result = await db.execute(
        select(Knowledge).where(
            Knowledge.id == knowledge_id,
            Knowledge.workspace_id == workspace_id,
            Knowledge.type == "journal",
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Journal not found.")

    # Same-day restriction
    if not _is_today(record):
        raise HTTPException(
            status_code=403,
            detail="Cannot edit a journal from a previous day. Create a new journal for today.",
        )

    entries = _parse_journal_entries(record.content)

    if entry_index < 0 or entry_index >= len(entries):
        raise HTTPException(status_code=404, detail=f"Entry index {entry_index} does not exist.")

    entry = entries[entry_index]

    # 5-minute edit window
    if not _is_entry_editable(entry.get("timestamp", "")):
        raise HTTPException(
            status_code=403,
            detail="This entry can no longer be edited. Entries are editable for 5 minutes after creation.",
        )

    if not body.body or not body.body.strip():
        raise HTTPException(status_code=422, detail="Entry body cannot be empty.")

    entries[entry_index]["body"] = body.body.strip()
    record.content = _serialize_entries(entries)
    record.word_count = sum(len(e.get("body", "").split()) for e in entries)

    await db.commit()
    await db.refresh(record)
    return _to_journal_response(record)
