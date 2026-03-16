"""Approval request service."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ApprovalRequestModel

logger = logging.getLogger("openforge.approval_service")


class ApprovalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_request(
        self,
        *,
        request_type: str,
        scope_type: str,
        scope_id: str | None,
        source_run_id: UUID | None,
        requested_action: str,
        tool_name: str | None,
        reason_code: str,
        reason_text: str,
        risk_category: str,
        payload_preview: dict | None,
        matched_policy_id: UUID | None = None,
        matched_rule_id: UUID | None = None,
    ) -> ApprovalRequestModel:
        request = ApprovalRequestModel(
            request_type=request_type,
            scope_type=scope_type,
            scope_id=scope_id,
            source_run_id=source_run_id,
            requested_action=requested_action,
            tool_name=tool_name,
            reason_code=reason_code,
            reason_text=reason_text,
            risk_category=risk_category,
            payload_preview=payload_preview,
            matched_policy_id=matched_policy_id,
            matched_rule_id=matched_rule_id,
        )
        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)
        return request

    async def list_approval_requests(self, *, status: str | None = "pending", limit: int = 100, offset: int = 0) -> list[ApprovalRequestModel]:
        query = select(ApprovalRequestModel)
        if status:
            query = query.where(ApprovalRequestModel.status == status)
        query = query.order_by(ApprovalRequestModel.requested_at.desc()).offset(offset).limit(limit)
        return list((await self.db.execute(query)).scalars().all())

    async def get_request(self, approval_id: UUID) -> ApprovalRequestModel | None:
        return await self.db.get(ApprovalRequestModel, approval_id)

    async def approve_request(self, approval_id: UUID, note: str | None = None, resolved_by: str = "operator") -> ApprovalRequestModel | None:
        request = await self.db.get(ApprovalRequestModel, approval_id)
        if request is None or request.status != "pending":
            return None
        request.status = "approved"
        request.resolved_at = datetime.now(timezone.utc)
        request.resolved_by = resolved_by
        request.resolution_note = note
        await self.db.commit()
        await self.db.refresh(request)
        # Unblock the waiting execution engine via HITL service
        await self._notify_hitl(str(approval_id), approved=True)
        return request

    async def deny_request(self, approval_id: UUID, note: str | None = None, resolved_by: str = "operator") -> ApprovalRequestModel | None:
        request = await self.db.get(ApprovalRequestModel, approval_id)
        if request is None or request.status != "pending":
            return None
        request.status = "denied"
        request.resolved_at = datetime.now(timezone.utc)
        request.resolved_by = resolved_by
        request.resolution_note = note
        await self.db.commit()
        await self.db.refresh(request)
        # Unblock the waiting execution engine via HITL service
        await self._notify_hitl(str(approval_id), approved=False)
        return request

    async def _notify_hitl(self, hitl_id: str, *, approved: bool) -> None:
        """Notify the HITL service so the waiting agent is unblocked."""
        try:
            from openforge.runtime.hitl import hitl_service
            # Unblock in-process waiter
            hitl_service.resolve(hitl_id, approved)
            # Unblock cross-process waiter (Celery)
            await hitl_service._publish_redis_decision(hitl_id, approved)
        except Exception as exc:
            logger.warning("Failed to notify HITL service for %s: %s", hitl_id, exc)
