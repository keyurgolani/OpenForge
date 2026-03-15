"""
Mission health computation service.

Computes health status and diagnostics for a mission based on
recent run history, error patterns, and trigger information.
"""

import logging
from datetime import timedelta
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.common.time import utc_now
from openforge.db.models import (
    MissionBudgetPolicyModel,
    MissionDefinitionModel,
    RunModel,
    TriggerDefinitionModel,
    TriggerFireHistoryModel,
)
from openforge.domains.common.enums import MissionHealthStatus

logger = logging.getLogger(__name__)

# Window for "recent" run analysis
HEALTH_WINDOW_HOURS = 24
# Thresholds
FAILURE_RATE_DEGRADED = 0.3
FAILURE_RATE_FAILING = 0.6
MIN_RUNS_FOR_HEALTH = 1


class MissionHealthComputer:
    """Computes health status for missions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def compute_health(self, mission_id: UUID) -> dict[str, Any]:
        """
        Compute health status for a mission based on recent runs.

        Returns a dict with health_status, summary, and recent stats.
        """
        mission = await self.db.get(MissionDefinitionModel, mission_id)
        if mission is None:
            raise ValueError(f"Mission not found: {mission_id}")

        now = utc_now()
        window_start = now - timedelta(hours=HEALTH_WINDOW_HOURS)

        # Query recent runs
        recent_runs_query = (
            select(RunModel)
            .where(
                RunModel.mission_id == mission_id,
                RunModel.created_at >= window_start,
            )
            .order_by(desc(RunModel.created_at))
        )
        result = await self.db.execute(recent_runs_query)
        recent_runs = result.scalars().all()

        total = len(recent_runs)
        completed = sum(1 for r in recent_runs if r.status == "completed")
        failed = sum(1 for r in recent_runs if r.status == "failed")
        approval_blocked = sum(
            1 for r in recent_runs if r.status == "waiting_approval"
        )

        # Determine health status
        if total < MIN_RUNS_FOR_HEALTH:
            health_status = MissionHealthStatus.UNKNOWN
            summary = "Insufficient run data for health assessment"
        else:
            failure_rate = failed / total
            if failure_rate >= FAILURE_RATE_FAILING:
                health_status = MissionHealthStatus.FAILING
                summary = f"High failure rate: {failed}/{total} runs failed in last {HEALTH_WINDOW_HOURS}h"
            elif failure_rate >= FAILURE_RATE_DEGRADED:
                health_status = MissionHealthStatus.DEGRADED
                summary = f"Elevated failure rate: {failed}/{total} runs failed in last {HEALTH_WINDOW_HOURS}h"
            elif approval_blocked > 0 and approval_blocked >= total * 0.5:
                health_status = MissionHealthStatus.DEGRADED
                summary = f"Multiple runs blocked on approval: {approval_blocked}/{total}"
            else:
                health_status = MissionHealthStatus.HEALTHY
                summary = f"{completed}/{total} runs succeeded in last {HEALTH_WINDOW_HOURS}h"

        # Compute success rate
        success_rate = (completed / total * 100) if total > 0 else None

        # Collect last error
        last_error = None
        for r in recent_runs:
            if r.status == "failed" and r.error_message:
                last_error = r.error_message
                break

        # Update mission health fields
        mission.health_status = health_status.value
        mission.last_error_summary = last_error
        await self.db.commit()

        return {
            "mission_id": mission_id,
            "health_status": health_status,
            "summary": summary,
            "recent_run_count": total,
            "recent_success_count": completed,
            "recent_failure_count": failed,
            "success_rate": success_rate,
            "last_run_at": mission.last_run_at,
            "last_success_at": mission.last_success_at,
            "last_failure_at": mission.last_failure_at,
            "last_error_summary": last_error,
        }

    async def get_health_summary(self, mission_id: UUID) -> dict[str, Any]:
        """
        Get a full health report with run stats, error summary, and trigger info.
        """
        health = await self.compute_health(mission_id)

        mission = await self.db.get(MissionDefinitionModel, mission_id)
        if mission is None:
            raise ValueError(f"Mission not found: {mission_id}")

        now = utc_now()
        window_start = now - timedelta(hours=HEALTH_WINDOW_HOURS)

        # Budget info
        budget_info = await self._get_budget_info(mission)

        # Trigger info
        trigger_ids = mission.default_trigger_ids or []
        trigger_count = len(trigger_ids)
        enabled_count = 0
        if trigger_ids:
            enabled_count = await self.db.scalar(
                select(func.count())
                .select_from(TriggerDefinitionModel)
                .where(
                    TriggerDefinitionModel.id.in_(trigger_ids),
                    TriggerDefinitionModel.is_enabled.is_(True),
                )
            ) or 0

        # Recent errors (unique messages)
        error_query = (
            select(RunModel.error_message)
            .where(
                RunModel.mission_id == mission_id,
                RunModel.status == "failed",
                RunModel.error_message.is_not(None),
                RunModel.created_at >= window_start,
            )
            .order_by(desc(RunModel.created_at))
            .limit(10)
        )
        error_result = await self.db.execute(error_query)
        error_messages = [row[0] for row in error_result.all()]
        unique_errors = list(dict.fromkeys(error_messages))[:5]

        # Concurrent runs
        active_statuses = {"pending", "queued", "running", "waiting_approval", "retrying"}
        concurrent = await self.db.scalar(
            select(func.count())
            .select_from(RunModel)
            .where(
                RunModel.mission_id == mission_id,
                RunModel.status.in_(active_statuses),
            )
        ) or 0

        # Runs today
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        runs_today = await self.db.scalar(
            select(func.count())
            .select_from(RunModel)
            .where(
                RunModel.mission_id == mission_id,
                RunModel.created_at >= day_start,
            )
        ) or 0

        # Cooldown check
        cooldown_active = False
        cooldown_remaining = None
        if budget_info and budget_info.get("cooldown_seconds_after_failure"):
            if mission.last_failure_at:
                cooldown_end = mission.last_failure_at + timedelta(
                    seconds=budget_info["cooldown_seconds_after_failure"]
                )
                if now < cooldown_end:
                    cooldown_active = True
                    cooldown_remaining = int((cooldown_end - now).total_seconds())

        return {
            **health,
            "budget_policy_id": mission.budget_policy_id,
            "runs_today": int(runs_today),
            "max_runs_per_day": budget_info.get("max_runs_per_day") if budget_info else None,
            "concurrent_runs": int(concurrent),
            "max_concurrent_runs": budget_info.get("max_concurrent_runs") if budget_info else None,
            "budget_exhausted": (
                (
                    budget_info is not None
                    and budget_info.get("max_runs_per_day") is not None
                    and runs_today >= budget_info["max_runs_per_day"]
                )
                or (
                    budget_info is not None
                    and budget_info.get("max_concurrent_runs") is not None
                    and concurrent >= budget_info["max_concurrent_runs"]
                )
            ),
            "cooldown_active": cooldown_active,
            "cooldown_remaining_seconds": cooldown_remaining,
            "trigger_count": trigger_count,
            "enabled_trigger_count": int(enabled_count),
            "last_triggered_at": mission.last_triggered_at,
            "recent_error_count": health["recent_failure_count"],
            "repeated_errors": unique_errors,
        }

    async def _get_budget_info(
        self,
        mission: MissionDefinitionModel,
    ) -> Optional[dict[str, Any]]:
        """Load budget policy info if present."""
        if not mission.budget_policy_id:
            return None

        policy = await self.db.get(MissionBudgetPolicyModel, mission.budget_policy_id)
        if not policy:
            return None

        return {
            "max_runs_per_day": policy.max_runs_per_day,
            "max_runs_per_window": policy.max_runs_per_window,
            "window_seconds": policy.window_seconds,
            "max_concurrent_runs": policy.max_concurrent_runs,
            "max_token_budget_per_window": policy.max_token_budget_per_window,
            "cooldown_seconds_after_failure": policy.cooldown_seconds_after_failure,
        }
