"""Service for recording and querying usage/cost data."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import UsageRecordModel

from .metrics import (
    LLMUsageRecord,
    ToolUsageRecord,
    UsageAggregation,
    aggregate_usage_records,
    estimate_cost,
)

logger = logging.getLogger("openforge.observability.cost_accounting")


class CostAccountingService:
    """Persist and query token/cost usage records."""

    async def record_llm_usage(self, db: AsyncSession, record: LLMUsageRecord) -> UsageRecordModel:
        """Persist an LLM usage record."""
        cost = record.estimated_cost_usd
        if cost is None:
            cost = estimate_cost(record.model_name, record.input_tokens, record.output_tokens)

        total_tokens = record.input_tokens + record.output_tokens + record.reasoning_tokens

        model = UsageRecordModel(
            workspace_id=record.workspace_id,
            run_id=record.run_id,
            step_id=record.step_id,
            workflow_id=record.workflow_id,
            mission_id=record.mission_id,
            profile_id=record.profile_id,
            record_type="llm_call",
            model_name=record.model_name,
            provider_name=record.provider_name,
            input_tokens=record.input_tokens,
            output_tokens=record.output_tokens,
            reasoning_tokens=record.reasoning_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=cost,
            latency_ms=record.latency_ms,
            success=record.success,
            error_code=record.error_code,
        )
        db.add(model)
        await db.flush()
        return model

    async def record_tool_usage(self, db: AsyncSession, record: ToolUsageRecord) -> UsageRecordModel:
        """Persist a tool usage record."""
        model = UsageRecordModel(
            workspace_id=record.workspace_id,
            run_id=record.run_id,
            step_id=record.step_id,
            workflow_id=record.workflow_id,
            mission_id=record.mission_id,
            record_type="tool_call",
            tool_name=record.tool_name,
            latency_ms=record.latency_ms,
            success=record.success,
            error_code=record.error_code,
        )
        db.add(model)
        await db.flush()
        return model

    async def get_run_usage(self, db: AsyncSession, run_id: UUID) -> UsageAggregation:
        """Aggregate all usage records for a single run."""
        stmt = select(UsageRecordModel).where(UsageRecordModel.run_id == run_id)
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return aggregate_usage_records([_row_to_dict(r) for r in rows])

    async def get_workflow_usage(
        self, db: AsyncSession, workflow_id: UUID, *, limit: int = 50
    ) -> UsageAggregation:
        """Aggregate usage across recent runs of a workflow."""
        stmt = (
            select(UsageRecordModel)
            .where(UsageRecordModel.workflow_id == workflow_id)
            .order_by(desc(UsageRecordModel.created_at))
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return aggregate_usage_records([_row_to_dict(r) for r in rows])

    async def get_mission_usage(
        self, db: AsyncSession, mission_id: UUID, *, limit: int = 50
    ) -> UsageAggregation:
        """Aggregate usage for a mission."""
        stmt = (
            select(UsageRecordModel)
            .where(UsageRecordModel.mission_id == mission_id)
            .order_by(desc(UsageRecordModel.created_at))
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return aggregate_usage_records([_row_to_dict(r) for r in rows])

    async def get_cost_hotspots(
        self, db: AsyncSession, workspace_id: UUID, *, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Return top cost items grouped by workflow/mission/profile.

        Each result is flattened into the ``CostHotspot`` schema shape with
        ``object_type``, ``object_id``, ``object_name``, ``total_cost_usd``,
        ``total_tokens``, and ``request_count``.
        """
        hotspots: list[dict[str, Any]] = []

        # Query per dimension so each row maps to one object_type / object_id.
        for col, obj_type in (
            (UsageRecordModel.workflow_id, "workflow"),
            (UsageRecordModel.mission_id, "mission"),
            (UsageRecordModel.profile_id, "profile"),
        ):
            stmt = (
                select(
                    col.label("object_id"),
                    func.sum(UsageRecordModel.estimated_cost_usd).label("total_cost_usd"),
                    func.sum(UsageRecordModel.total_tokens).label("total_tokens"),
                    func.count().label("request_count"),
                )
                .where(UsageRecordModel.workspace_id == workspace_id)
                .where(col.isnot(None))
                .group_by(col)
            )
            result = await db.execute(stmt)
            for row in result.all():
                hotspots.append({
                    "object_type": obj_type,
                    "object_id": row.object_id,
                    "object_name": None,
                    "total_cost_usd": float(row.total_cost_usd or 0),
                    "total_tokens": int(row.total_tokens or 0),
                    "request_count": row.request_count,
                })

        # Sort by cost descending and trim to the requested limit.
        hotspots.sort(key=lambda h: h["total_cost_usd"], reverse=True)
        return hotspots[:limit]


def _row_to_dict(row: UsageRecordModel) -> dict[str, Any]:
    """Convert a UsageRecordModel to a plain dict for aggregation."""
    return {
        "record_type": row.record_type,
        "model_name": row.model_name,
        "provider_name": row.provider_name,
        "tool_name": row.tool_name,
        "input_tokens": row.input_tokens,
        "output_tokens": row.output_tokens,
        "reasoning_tokens": row.reasoning_tokens,
        "total_tokens": row.total_tokens,
        "estimated_cost_usd": row.estimated_cost_usd,
        "latency_ms": row.latency_ms,
        "success": row.success,
        "error_code": row.error_code,
    }
