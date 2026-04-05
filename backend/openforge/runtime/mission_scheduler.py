"""Mission scheduler -- polls for due mission cycles and fires them.

Runs as a Celery Beat periodic task every 60 seconds. Mirrors the
deployment_scheduler pattern but operates on MissionModel directly
without a separate TriggerDefinitionModel.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    MissionCycleModel,
    MissionModel,
    RunModel,
    Workspace,
)

logger = logging.getLogger("openforge.mission_scheduler")


async def poll_missions(db: AsyncSession) -> int:
    """Find due missions and create cycle runs for them. Returns count of cycles fired."""
    now = datetime.now(timezone.utc)

    query = (
        select(MissionModel)
        .where(
            MissionModel.status == "active",
            MissionModel.next_cycle_at <= now,
        )
    )

    result = await db.execute(query)
    missions = result.scalars().all()
    fired = 0

    for mission in missions:
        try:
            # Check budget caps before firing
            budget = mission.budget or {}

            max_cost = budget.get("max_cost")
            if max_cost is not None and mission.cost_estimate >= max_cost:
                logger.info(
                    "Mission %s skipped: cost budget exhausted (%.4f >= %.4f)",
                    mission.id, mission.cost_estimate, max_cost,
                )
                mission.status = "completed"
                mission.completed_at = now
                mission.next_cycle_at = None
                continue

            max_tokens = budget.get("max_tokens")
            if max_tokens is not None and mission.tokens_used >= max_tokens:
                logger.info(
                    "Mission %s skipped: token budget exhausted (%d >= %d)",
                    mission.id, mission.tokens_used, max_tokens,
                )
                mission.status = "completed"
                mission.completed_at = now
                mission.next_cycle_at = None
                continue

            max_cycles = budget.get("max_cycles")
            if max_cycles is not None and mission.cycle_count >= max_cycles:
                logger.info(
                    "Mission %s skipped: cycle limit reached (%d >= %d)",
                    mission.id, mission.cycle_count, max_cycles,
                )
                mission.status = "completed"
                mission.completed_at = now
                mission.next_cycle_at = None
                continue

            # Resolve owned workspace for the run
            owned_workspace_id = mission.owned_workspace_id
            if owned_workspace_id is None:
                # Use first available user workspace
                ws_stmt = (
                    select(Workspace.id)
                    .where(Workspace.ownership_type == "user")
                    .order_by(Workspace.sort_order)
                    .limit(1)
                )
                ws_result = (await db.execute(ws_stmt)).scalar_one_or_none()
                if ws_result:
                    owned_workspace_id = ws_result
                else:
                    logger.warning(
                        "Mission %s has no workspace and no user workspaces exist",
                        mission.id,
                    )
                    continue

            # Create cycle record
            cycle_number = mission.cycle_count + 1
            cycle = MissionCycleModel(
                mission_id=mission.id,
                cycle_number=cycle_number,
                phase="perceive",
                status="running",
                started_at=now,
            )
            db.add(cycle)
            await db.flush()

            # Create run record
            run = RunModel(
                run_type="mission",
                mission_id=mission.id,
                input_payload={
                    "mission_id": str(mission.id),
                    "cycle_number": cycle_number,
                    "mission_name": mission.name,
                },
                composite_metadata={
                    "mission_id": str(mission.id),
                    "cycle_id": str(cycle.id),
                    "cycle_number": cycle_number,
                    "autonomous_agent_id": str(mission.autonomous_agent_id),
                },
                status="pending",
            )
            db.add(run)
            await db.flush()

            # Link cycle to run
            cycle.primary_run_id = run.id

            # Queue Celery task
            from openforge.worker.tasks import execute_mission_cycle
            execute_mission_cycle.delay(
                mission_id=str(mission.id),
                cycle_id=str(cycle.id),
                run_id=str(run.id),
            )

            # Update mission timing
            mission.last_cycle_at = now

            fired += 1
            logger.info(
                "Fired mission %s cycle %d, run %s",
                mission.id, cycle_number, run.id,
            )

        except Exception as exc:
            logger.error("Failed to fire mission %s: %s", mission.id, exc)

    if fired:
        await db.commit()

    return fired
