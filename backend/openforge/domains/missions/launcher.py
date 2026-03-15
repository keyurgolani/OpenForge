"""
Mission launcher service.

Handles the launch sequence for a mission: validation, budget guard checks,
run creation, trigger fire recording, and health metadata updates.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.common.time import utc_now
from openforge.db.models import (
    MissionBudgetPolicyModel,
    MissionDefinitionModel,
    RunModel,
    TriggerFireHistoryModel,
)

logger = logging.getLogger(__name__)


class MissionLauncher:
    """Launches mission runs with budget guard enforcement."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def launch_mission(
        self,
        mission_id: UUID,
        workspace_id: UUID,
        parameters: Optional[dict[str, Any]] = None,
        trigger_id: Optional[UUID] = None,
        trigger_type: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Launch a mission by creating a new run.

        Steps:
        1. Load and validate mission definition
        2. Check budget policy constraints
        3. Create a run record
        4. Update mission health metadata
        5. Record trigger fire history (if triggered)
        6. Return run info
        """
        # 1. Load mission definition
        mission = await self.db.get(MissionDefinitionModel, mission_id)
        if mission is None:
            raise ValueError(f"Mission not found: {mission_id}")

        if str(mission.workspace_id) != str(workspace_id):
            raise ValueError("Mission does not belong to the specified workspace")

        # 2. Verify mission is launchable
        launchable_statuses = {"active"}
        if mission.status not in launchable_statuses:
            raise ValueError(
                f"Mission cannot be launched in status '{mission.status}'. "
                f"Must be one of: {', '.join(launchable_statuses)}"
            )

        # 3. Check budget policy constraints
        budget_policy = None
        if mission.budget_policy_id:
            budget_policy = await self.db.get(
                MissionBudgetPolicyModel, mission.budget_policy_id
            )

        if budget_policy:
            allowed, reason = await self._check_budget_guards(mission, budget_policy)
            if not allowed:
                # Record failed trigger fire if applicable
                if trigger_id:
                    await self._record_trigger_fire(
                        trigger_id=trigger_id,
                        mission_id=mission_id,
                        run_id=None,
                        status="blocked",
                        error=reason,
                        trigger_type=trigger_type,
                    )
                raise ValueError(f"Budget guard blocked launch: {reason}")

        # 4. Create a run record
        now = utc_now()
        run = RunModel(
            run_type="mission",
            workflow_id=mission.workflow_id,
            workflow_version_id=mission.workflow_version_id,
            mission_id=mission_id,
            trigger_id=trigger_id,
            workspace_id=workspace_id,
            status="pending",
            input_payload=parameters or {},
            created_at=now,
            updated_at=now,
        )
        self.db.add(run)
        await self.db.flush()

        # 5. Update mission health metadata
        mission.last_run_at = now
        if trigger_id:
            mission.last_triggered_at = now

        await self.db.flush()

        # 6. Record trigger fire history
        if trigger_id:
            await self._record_trigger_fire(
                trigger_id=trigger_id,
                mission_id=mission_id,
                run_id=run.id,
                status="launched",
                trigger_type=trigger_type,
            )

        await self.db.commit()
        await self.db.refresh(run)

        logger.info(
            "Mission %s launched: run_id=%s trigger_id=%s",
            mission_id,
            run.id,
            trigger_id,
        )

        return {
            "run_id": run.id,
            "status": run.status,
            "message": "Mission launched successfully",
        }

    async def _check_budget_guards(
        self,
        mission: MissionDefinitionModel,
        budget_policy: MissionBudgetPolicyModel,
    ) -> tuple[bool, Optional[str]]:
        """
        Check budget policy constraints.

        Returns:
            Tuple of (allowed, reason). If allowed is False, reason explains why.
        """
        now = utc_now()
        mission_id = mission.id

        # Check max_runs_per_day
        if budget_policy.max_runs_per_day is not None:
            day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            count_today = await self.db.scalar(
                select(func.count())
                .select_from(RunModel)
                .where(
                    RunModel.mission_id == mission_id,
                    RunModel.created_at >= day_start,
                )
            ) or 0
            if count_today >= budget_policy.max_runs_per_day:
                return False, (
                    f"Daily run limit reached: {count_today}/{budget_policy.max_runs_per_day}"
                )

        # Check max_concurrent_runs
        if budget_policy.max_concurrent_runs is not None:
            active_statuses = {"pending", "queued", "running", "waiting_approval", "retrying"}
            concurrent = await self.db.scalar(
                select(func.count())
                .select_from(RunModel)
                .where(
                    RunModel.mission_id == mission_id,
                    RunModel.status.in_(active_statuses),
                )
            ) or 0
            if concurrent >= budget_policy.max_concurrent_runs:
                return False, (
                    f"Concurrent run limit reached: {concurrent}/{budget_policy.max_concurrent_runs}"
                )

        # Check cooldown after failure
        if budget_policy.cooldown_seconds_after_failure is not None:
            if mission.last_failure_at is not None:
                cooldown_end = mission.last_failure_at + timedelta(
                    seconds=budget_policy.cooldown_seconds_after_failure
                )
                if now < cooldown_end:
                    remaining = int((cooldown_end - now).total_seconds())
                    return False, (
                        f"Cooldown after failure active: {remaining}s remaining"
                    )

        # Check max_runs_per_window (sliding window)
        if (
            budget_policy.max_runs_per_window is not None
            and budget_policy.window_seconds is not None
        ):
            window_start = now - timedelta(seconds=budget_policy.window_seconds)
            count_in_window = await self.db.scalar(
                select(func.count())
                .select_from(RunModel)
                .where(
                    RunModel.mission_id == mission_id,
                    RunModel.created_at >= window_start,
                )
            ) or 0
            if count_in_window >= budget_policy.max_runs_per_window:
                return False, (
                    f"Window run limit reached: {count_in_window}/{budget_policy.max_runs_per_window} "
                    f"in {budget_policy.window_seconds}s window"
                )

        return True, None

    async def _record_trigger_fire(
        self,
        trigger_id: UUID,
        mission_id: UUID,
        run_id: Optional[UUID],
        status: str,
        error: Optional[str] = None,
        trigger_type: Optional[str] = None,
    ) -> None:
        """Insert a trigger fire history record."""
        payload_snapshot = {"trigger_type": trigger_type} if trigger_type else None
        record = TriggerFireHistoryModel(
            trigger_id=trigger_id,
            mission_id=mission_id,
            run_id=run_id,
            fired_at=utc_now(),
            launch_status=status,
            error_message=error,
            payload_snapshot=payload_snapshot,
        )
        self.db.add(record)
        await self.db.flush()
