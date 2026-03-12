from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import HITLRequest

logger = logging.getLogger("openforge.services.hitl")


class HITLService:
    """
    Manages HITL request lifecycle: creation, waiting, and resolution.

    Uses Redis pub/sub to coordinate between the running agent (which may be
    in a Celery worker process) and the approve/deny API endpoints (which run
    in the FastAPI process).  Falls back to in-process asyncio.Events when
    both sides share the same process (inline mode).
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

        Listens on both the in-process asyncio.Event (for inline mode) and a
        Redis pub/sub channel (for cross-process Celery mode).
        """
        key = str(hitl_id)
        event = self._pending_events.get(key)
        if not event:
            return False

        redis_conn = None
        redis_sub = None
        redis_task = None
        try:
            # Start a Redis subscriber that will set the local event when
            # a decision arrives from the FastAPI process.
            redis_conn, redis_sub, redis_task = await self._subscribe_redis_decision(key, event)
        except Exception as exc:
            logger.debug("Redis HITL subscription unavailable, using local event only: %s", exc)

        try:
            await asyncio.wait_for(asyncio.shield(event.wait()), timeout=timeout)
            return self._decisions.pop(key, False)
        except asyncio.TimeoutError:
            self._pending_events.pop(key, None)
            return False
        finally:
            # Clean up Redis subscription and dedicated connection
            if redis_task and not redis_task.done():
                redis_task.cancel()
                try:
                    await redis_task
                except (asyncio.CancelledError, Exception):
                    pass
            if redis_sub:
                try:
                    await redis_sub.unsubscribe(f"hitl_decision:{key}")
                    await redis_sub.aclose()
                except Exception:
                    pass
            if redis_conn:
                try:
                    await redis_conn.aclose()
                except Exception:
                    pass

    async def _subscribe_redis_decision(
        self, hitl_id: str, event: asyncio.Event
    ) -> tuple:
        """Subscribe to the Redis channel for this HITL decision.

        Returns (pubsub, listener_task).  The listener sets the local
        asyncio.Event and records the decision when a message arrives.

        Creates a dedicated Redis connection for the subscription to avoid
        event-loop affinity issues in Celery workers.
        """
        import redis.asyncio as aioredis
        from openforge.config import get_settings

        settings = get_settings()
        redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"hitl_decision:{hitl_id}"
        await pubsub.subscribe(channel)

        async def _listener():
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            approved = data.get("approved", False)
                            self._decisions[hitl_id] = approved
                            self._pending_events.pop(hitl_id, None)
                            event.set()
                        except Exception:
                            pass
                        return
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug("Redis HITL listener error: %s", exc)

        task = asyncio.create_task(_listener())
        return redis, pubsub, task

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

    async def _publish_redis_decision(self, hitl_id: str, approved: bool) -> None:
        """Publish the HITL decision to Redis so cross-process waiters unblock."""
        try:
            from openforge.db.redis_client import get_redis

            redis = await get_redis()
            await redis.publish(
                f"hitl_decision:{hitl_id}",
                json.dumps({"approved": approved}),
            )
        except Exception as exc:
            logger.warning("Failed to publish HITL decision to Redis: %s", exc)

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
        # Unblock local waiter (inline mode)
        self.resolve(str(hitl_id), True)
        # Unblock cross-process waiter (Celery mode)
        await self._publish_redis_decision(str(hitl_id), True)
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
        # Unblock local waiter (inline mode)
        self.resolve(str(hitl_id), False)
        # Unblock cross-process waiter (Celery mode)
        await self._publish_redis_decision(str(hitl_id), False)
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
