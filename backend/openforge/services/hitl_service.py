"""
HITL (Human-in-the-Loop) Service for OpenForge.

Manages approval requests for high-risk tool calls.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Any
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import HITLRequest, HITLAuditLog, Workspace, Conversation
from openforge.worker.celery_app import celery_app

logger = logging.getLogger("openforge.hitl")


class HITLService:
    """Service for managing HITL approval requests."""

    async def create_request(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        conversation_id: Optional[UUID],
        execution_id: UUID,
        tool_id: str,
        tool_display_name: Optional[str],
        tool_input: dict[str, Any],
        agent_state: dict[str, Any],
    ) -> HITLRequest:
        """
        Create a new HITL request.

        This is called by the agent engine when a tool requires approval.
        """
        request = HITLRequest(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            execution_id=execution_id,
            tool_id=tool_id,
            tool_input=tool_input,
            agent_state=agent_state,
            status="pending",
        )
        db.add(request)
        await db.flush()

        # Create audit log entry
        audit = HITLAuditLog(
            request_id=request.id,
            workspace_id=workspace_id,
            action="created",
            details={
                "tool_id": tool_id,
                "tool_display_name": tool_display_name,
            },
        )
        db.add(audit)
        await db.commit()
        await db.refresh(request)

        # Publish event to Redis for WebSocket relay
        await self._publish_request_event(request, tool_display_name)
        await self._publish_count_event(db)

        logger.info(f"Created HITL request: {request.id} for tool: {tool_id}")
        return request

    async def get_pending(
        self,
        db: AsyncSession,
        workspace_id: Optional[UUID] = None,
    ) -> list[dict]:
        """Get all pending HITL requests."""
        query = select(HITLRequest).where(HITLRequest.status == "pending")

        if workspace_id:
            query = query.where(HITLRequest.workspace_id == workspace_id)

        query = query.order_by(HITLRequest.created_at.desc())

        result = await db.execute(query)
        requests = result.scalars().all()

        # Enrich with display names
        enriched = []
        for req in requests:
            item = self._request_to_dict(req)
            item["tool_display_name"] = await self._get_tool_display_name(req.tool_id)

            # Get workspace name
            ws_result = await db.execute(
                select(Workspace.name).where(Workspace.id == req.workspace_id)
            )
            item["workspace_name"] = ws_result.scalar_one_or_none()

            # Get conversation title if applicable
            if req.conversation_id:
                conv_result = await db.execute(
                    select(Conversation.title).where(Conversation.id == req.conversation_id)
                )
                item["conversation_title"] = conv_result.scalar_one_or_none()

            enriched.append(item)

        return enriched

    async def get_pending_count(self, db: AsyncSession) -> int:
        """Get count of pending HITL requests."""
        result = await db.execute(
            select(func.count()).select_from(HITLRequest).where(HITLRequest.status == "pending")
        )
        return result.scalar() or 0

    async def approve(
        self,
        db: AsyncSession,
        request_id: UUID,
        resolution_note: Optional[str] = None,
    ) -> Optional[HITLRequest]:
        """Approve an HITL request and resume the agent."""
        result = await db.execute(
            select(HITLRequest).where(HITLRequest.id == request_id)
        )
        request = result.scalar_one_or_none()

        if not request:
            return None

        if request.status != "pending":
            raise ValueError(f"Request already resolved: {request.status}")

        # Update request
        request.status = "approved"
        request.resolved_at = datetime.now(timezone.utc)
        request.resolution_note = resolution_note

        # Create audit log
        audit = HITLAuditLog(
            request_id=request.id,
            workspace_id=request.workspace_id,
            action="approved",
            details={"resolution_note": resolution_note},
        )
        db.add(audit)
        await db.commit()
        await db.refresh(request)

        # Dispatch Celery task to resume agent
        celery_app.send_task(
            "agent.resume_after_hitl",
            kwargs={
                "execution_id": str(request.execution_id),
                "hitl_request_id": str(request.id),
                "approved": True,
                "tool_id": request.tool_id,
                "tool_input": request.tool_input,
                "agent_state": request.agent_state,
            },
        )

        # Publish event
        await self._publish_resolve_event(request, "approved")
        await self._publish_count_event(db)

        logger.info(f"Approved HITL request: {request_id}")
        return request

    async def deny(
        self,
        db: AsyncSession,
        request_id: UUID,
        resolution_note: Optional[str] = None,
    ) -> Optional[HITLRequest]:
        """Deny an HITL request and resume the agent."""
        result = await db.execute(
            select(HITLRequest).where(HITLRequest.id == request_id)
        )
        request = result.scalar_one_or_none()

        if not request:
            return None

        if request.status != "pending":
            raise ValueError(f"Request already resolved: {request.status}")

        # Update request
        request.status = "denied"
        request.resolved_at = datetime.now(timezone.utc)
        request.resolution_note = resolution_note

        # Create audit log
        audit = HITLAuditLog(
            request_id=request.id,
            workspace_id=request.workspace_id,
            action="denied",
            details={"resolution_note": resolution_note},
        )
        db.add(audit)
        await db.commit()
        await db.refresh(request)

        # Dispatch Celery task to resume agent
        celery_app.send_task(
            "agent.resume_after_hitl",
            kwargs={
                "execution_id": str(request.execution_id),
                "hitl_request_id": str(request.id),
                "approved": False,
                "tool_id": request.tool_id,
                "tool_input": request.tool_input,
                "agent_state": request.agent_state,
            },
        )

        # Publish event
        await self._publish_resolve_event(request, "denied")
        await self._publish_count_event(db)

        logger.info(f"Denied HITL request: {request_id}")
        return request

    async def get_history(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        workspace_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        """Get paginated HITL history with audit logs."""
        offset = (page - 1) * page_size

        # Build query
        query = select(HITLRequest)
        count_query = select(func.count()).select_from(HITLRequest)

        if workspace_id:
            query = query.where(HITLRequest.workspace_id == workspace_id)
            count_query = count_query.where(HITLRequest.workspace_id == workspace_id)
        if status:
            query = query.where(HITLRequest.status == status)
            count_query = count_query.where(HITLRequest.status == status)

        # Get total count
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        # Get paginated results
        query = query.order_by(HITLRequest.created_at.desc()).offset(offset).limit(page_size)
        result = await db.execute(query)
        requests = result.scalars().all()

        # Enrich results
        enriched = []
        for req in requests:
            item = self._request_to_dict(req)
            item["tool_display_name"] = await self._get_tool_display_name(req.tool_id)
            enriched.append(item)

        return enriched, total

    def _request_to_dict(self, request: HITLRequest) -> dict:
        """Convert HITLRequest to dictionary."""
        return {
            "id": str(request.id),
            "workspace_id": str(request.workspace_id),
            "conversation_id": str(request.conversation_id) if request.conversation_id else None,
            "execution_id": str(request.execution_id),
            "tool_id": request.tool_id,
            "tool_input": request.tool_input,
            "agent_state": request.agent_state,
            "status": request.status,
            "created_at": request.created_at.isoformat() if request.created_at else None,
            "resolved_at": request.resolved_at.isoformat() if request.resolved_at else None,
            "resolution_note": request.resolution_note,
        }

    async def _get_tool_display_name(self, tool_id: str) -> str:
        """Get display name for a tool."""
        # Try to get from tool definitions
        from openforge.db.models import ToolDefinition
        from openforge.db.postgres import AsyncSessionLocal

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ToolDefinition.display_name).where(ToolDefinition.id == tool_id)
                )
                display_name = result.scalar_one_or_none()
                if display_name:
                    return display_name
        except Exception:
            pass

        # Fallback: format tool_id
        return tool_id.replace("_", " ").replace(".", " ").title()

    async def _publish_request_event(self, request: HITLRequest, tool_display_name: Optional[str]) -> None:
        """Publish HITL request event to Redis."""
        try:
            from openforge.db.redis_client import get_redis
            import json

            redis = await get_redis()
            event = {
                "type": "hitl_request",
                "request": {
                    "id": str(request.id),
                    "workspace_id": str(request.workspace_id),
                    "conversation_id": str(request.conversation_id) if request.conversation_id else None,
                    "tool_id": request.tool_id,
                    "tool_display_name": tool_display_name,
                    "tool_input": request.tool_input,
                    "status": request.status,
                    "created_at": request.created_at.isoformat() if request.created_at else None,
                },
            }

            # Publish to workspace channel
            await redis.publish(f"workspace:{request.workspace_id}", json.dumps(event))

            # Also publish to global HITL channel
            await redis.publish("hitl:global", json.dumps(event))

        except Exception as e:
            logger.warning(f"Failed to publish HITL request event: {e}")

    async def _publish_resolve_event(self, request: HITLRequest, status: str) -> None:
        """Publish HITL resolve event to Redis."""
        try:
            from openforge.db.redis_client import get_redis
            import json

            redis = await get_redis()
            event = {
                "type": "hitl_resolved",
                "request_id": str(request.id),
                "workspace_id": str(request.workspace_id),
                "conversation_id": str(request.conversation_id) if request.conversation_id else None,
                "status": status,
            }

            await redis.publish(f"workspace:{request.workspace_id}", json.dumps(event))
            await redis.publish("hitl:global", json.dumps(event))

        except Exception as e:
            logger.warning(f"Failed to publish HITL resolve event: {e}")

    async def _publish_count_event(self, db: AsyncSession) -> None:
        """Publish updated HITL count to Redis."""
        try:
            from openforge.db.redis_client import get_redis
            import json

            count = await self.get_pending_count(db)
            redis = await get_redis()
            await redis.publish("hitl:count", json.dumps({"count": count}))

        except Exception as e:
            logger.warning(f"Failed to publish HITL count event: {e}")


# Global instance
hitl_service = HITLService()
