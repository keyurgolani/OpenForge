"""Service for recording and querying structured failures."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import FailureEventModel

from .failure_taxonomy import classify_failure

logger = logging.getLogger("openforge.observability.failure_recording")


class FailureRecordingService:
    """Persist and query structured failure events."""

    async def record_failure(
        self,
        db: AsyncSession,
        *,
        failure_class: str,
        summary: str,
        run_id: UUID | None = None,
        step_id: UUID | None = None,
        workspace_id: UUID | None = None,
        workflow_id: UUID | None = None,
        mission_id: UUID | None = None,
        trigger_id: UUID | None = None,
        detail: dict[str, Any] | None = None,
        affected_node_key: str | None = None,
        related_policy_id: UUID | None = None,
        related_approval_id: UUID | None = None,
    ) -> FailureEventModel:
        """Classify a failure and persist a FailureEventModel."""
        classification = classify_failure(failure_class)

        model = FailureEventModel(
            workspace_id=workspace_id,
            run_id=run_id,
            step_id=step_id,
            workflow_id=workflow_id,
            mission_id=mission_id,
            trigger_id=trigger_id,
            failure_class=classification.failure_class,
            error_code=classification.error_code,
            severity=classification.severity.value,
            retryability=classification.retryability.value,
            summary=summary,
            detail_json=detail or {},
            affected_node_key=affected_node_key,
            related_policy_id=related_policy_id,
            related_approval_id=related_approval_id,
        )
        db.add(model)
        await db.flush()
        return model

    async def get_run_failures(
        self, db: AsyncSession, run_id: UUID
    ) -> list[dict[str, Any]]:
        """Return all failures for a run, ordered by creation time."""
        stmt = (
            select(FailureEventModel)
            .where(FailureEventModel.run_id == run_id)
            .order_by(FailureEventModel.created_at)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [_failure_to_dict(r) for r in rows]

    async def get_failure_rollup(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        *,
        group_by: str = "failure_class",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Summarize top failure classes for a workspace."""
        group_col = getattr(FailureEventModel, group_by, FailureEventModel.failure_class)

        stmt = (
            select(
                group_col.label("group_key"),
                FailureEventModel.severity,
                FailureEventModel.retryability,
                func.count().label("count"),
                func.max(FailureEventModel.created_at).label("latest_at"),
            )
            .where(FailureEventModel.workspace_id == workspace_id)
            .group_by(group_col, FailureEventModel.severity, FailureEventModel.retryability)
            .order_by(desc("count"))
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.all()
        return [
            {
                "group_key": row.group_key,
                "severity": row.severity,
                "retryability": row.retryability,
                "count": row.count,
                "latest_at": row.latest_at.isoformat() if row.latest_at else None,
            }
            for row in rows
        ]

    async def get_mission_failures(
        self, db: AsyncSession, mission_id: UUID, *, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Return failures for a mission, ordered by most recent first."""
        stmt = (
            select(FailureEventModel)
            .where(FailureEventModel.mission_id == mission_id)
            .order_by(desc(FailureEventModel.created_at))
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [_failure_to_dict(r) for r in rows]


def _failure_to_dict(row: FailureEventModel) -> dict[str, Any]:
    """Convert a FailureEventModel to a plain dict."""
    return {
        "id": str(row.id),
        "workspace_id": str(row.workspace_id) if row.workspace_id else None,
        "run_id": str(row.run_id) if row.run_id else None,
        "step_id": str(row.step_id) if row.step_id else None,
        "workflow_id": str(row.workflow_id) if row.workflow_id else None,
        "mission_id": str(row.mission_id) if row.mission_id else None,
        "trigger_id": str(row.trigger_id) if row.trigger_id else None,
        "failure_class": row.failure_class,
        "error_code": row.error_code,
        "severity": row.severity,
        "retryability": row.retryability,
        "summary": row.summary,
        "detail": row.detail_json,
        "affected_node_key": row.affected_node_key,
        "related_policy_id": str(row.related_policy_id) if row.related_policy_id else None,
        "related_approval_id": str(row.related_approval_id) if row.related_approval_id else None,
        "resolved": row.resolved,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
