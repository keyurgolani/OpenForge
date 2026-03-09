from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import HITLRequest


class HITLService:
    """
    Manages HITL request lifecycle: creation, waiting, and resolution.

    Uses in-process asyncio.Events to coordinate between the running agent
    (which waits for a decision) and the approve/deny API endpoints (which
    set the events).  This works correctly for a single-process deployment.
    """

    def __init__(self):
        # hitl_id → asyncio.Event (set when decision arrives)
        self._pending_events: dict[str, asyncio.Event] = {}
        # hitl_id → bool (True = approved, False = denied)
        self._decisions: dict[str, bool] = {}

    async def create_request(
        self,
        db: AsyncSession,
        *,
        workspace_id: UUID,
        conversation_id: UUID,
        tool_id: str,
        tool_input: dict,
        action_summary: str,
        risk_level: str,
    ) -> HITLRequest:
        req = HITLRequest(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            tool_id=tool_id,
            tool_input=tool_input,
            action_summary=action_summary,
            risk_level=risk_level,
        )
        db.add(req)
        await db.commit()
        await db.refresh(req)
        return req

    def register_event(self, hitl_id: str) -> asyncio.Event:
        """Create and register an asyncio.Event for the given HITL request ID."""
        event = asyncio.Event()
        self._pending_events[hitl_id] = event
        return event

    async def wait_for_decision(self, hitl_id: str, timeout: float = 300.0) -> bool:
        """
        Block the calling coroutine until the user approves or denies, or timeout.
        Returns True if approved, False if denied or timed out.
        """
        event = self._pending_events.get(str(hitl_id))
        if not event:
            return False
        try:
            await asyncio.wait_for(asyncio.shield(event.wait()), timeout=timeout)
            return self._decisions.pop(str(hitl_id), False)
        except asyncio.TimeoutError:
            self._pending_events.pop(str(hitl_id), None)
            return False

    def resolve(self, hitl_id: str, approved: bool) -> bool:
        """
        Called by the approve/deny API to unblock the waiting agent.
        Returns True if there was a waiting event (agent was still paused).
        """
        key = str(hitl_id)
        event = self._pending_events.pop(key, None)
        if event:
            self._decisions[key] = approved
            event.set()
            return True
        return False

    async def approve(
        self, db: AsyncSession, hitl_id: UUID, note: Optional[str] = None
    ) -> Optional[HITLRequest]:
        result = await db.execute(select(HITLRequest).where(HITLRequest.id == hitl_id))
        req = result.scalar_one_or_none()
        if not req or req.status != "pending":
            return None
        req.status = "approved"
        req.resolution_note = note
        req.resolved_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(req)
        self.resolve(str(hitl_id), True)
        return req

    async def deny(
        self, db: AsyncSession, hitl_id: UUID, note: Optional[str] = None
    ) -> Optional[HITLRequest]:
        result = await db.execute(select(HITLRequest).where(HITLRequest.id == hitl_id))
        req = result.scalar_one_or_none()
        if not req or req.status != "pending":
            return None
        req.status = "denied"
        req.resolution_note = note
        req.resolved_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(req)
        self.resolve(str(hitl_id), False)
        return req

    async def list_pending(
        self, db: AsyncSession, workspace_id: Optional[UUID] = None
    ) -> list[HITLRequest]:
        q = select(HITLRequest).where(HITLRequest.status == "pending")
        if workspace_id:
            q = q.where(HITLRequest.workspace_id == workspace_id)
        q = q.order_by(HITLRequest.created_at.desc())
        result = await db.execute(q)
        return list(result.scalars().all())

    async def count_pending(
        self, db: AsyncSession, workspace_id: Optional[UUID] = None
    ) -> int:
        q = select(func.count()).select_from(HITLRequest).where(HITLRequest.status == "pending")
        if workspace_id:
            q = q.where(HITLRequest.workspace_id == workspace_id)
        result = await db.execute(q)
        return result.scalar() or 0

    async def list_history(
        self,
        db: AsyncSession,
        workspace_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[HITLRequest]:
        q = select(HITLRequest).where(HITLRequest.status != "pending")
        if workspace_id:
            q = q.where(HITLRequest.workspace_id == workspace_id)
        q = q.order_by(HITLRequest.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(q)
        return list(result.scalars().all())


hitl_service = HITLService()
