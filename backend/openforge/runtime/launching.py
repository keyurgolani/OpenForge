"""
Runtime launching module.

This module provides the launch boundary for missions and triggers.
It delegates to MissionLauncher for mission launches and coordinates
trigger-to-mission launch resolution.
"""

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.domains.missions.launcher import MissionLauncher


class LaunchService:
    """Service for launching missions and triggers."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._mission_launcher = MissionLauncher(db)

    async def launch_mission(
        self,
        mission_id: UUID,
        workspace_id: UUID,
        parameters: Optional[dict[str, Any]] = None,
        trigger_id: Optional[UUID] = None,
        trigger_type: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Launch a mission through the MissionLauncher.

        Args:
            mission_id: ID of the mission to launch
            workspace_id: ID of the workspace
            parameters: Optional parameters for the mission
            trigger_id: ID of the trigger that initiated the launch
            trigger_type: Type of the trigger

        Returns:
            Launch result with run_id and status
        """
        return await self._mission_launcher.launch_mission(
            mission_id=mission_id,
            workspace_id=workspace_id,
            parameters=parameters,
            trigger_id=trigger_id,
            trigger_type=trigger_type,
        )

    async def launch_trigger(
        self,
        trigger_id: UUID,
        workspace_id: UUID,
        context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Resolve a trigger's target and launch the associated mission.

        Args:
            trigger_id: ID of the trigger to launch
            workspace_id: ID of the workspace
            context: Optional context for the trigger

        Returns:
            Launch result with run_id and status
        """
        from openforge.db.models import TriggerDefinitionModel

        trigger = await self.db.get(TriggerDefinitionModel, trigger_id)
        if trigger is None:
            return {
                "run_id": None,
                "status": "failed",
                "message": f"Trigger {trigger_id} not found",
            }

        if not trigger.is_enabled:
            return {
                "run_id": None,
                "status": "blocked",
                "message": "Trigger is disabled",
            }

        if trigger.target_type == "mission":
            return await self.launch_mission(
                mission_id=trigger.target_id,
                workspace_id=workspace_id,
                parameters=context,
                trigger_id=trigger_id,
                trigger_type=trigger.trigger_type,
            )

        return {
            "run_id": None,
            "status": "unsupported",
            "message": f"Unsupported trigger target type: {trigger.target_type}",
        }

    async def cancel_launch(
        self,
        run_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """
        Cancel a running launch by transitioning the run to cancelled.

        Args:
            run_id: ID of the run to cancel
            workspace_id: ID of the workspace

        Returns:
            Cancellation result with status
        """
        from openforge.db.models import RunModel

        run = await self.db.get(RunModel, run_id)
        if run is None:
            return {"status": "not_found", "message": f"Run {run_id} not found"}

        if run.status in ("completed", "failed", "cancelled"):
            return {"status": run.status, "message": "Run already in terminal state"}

        run.status = "cancelled"
        await self.db.commit()
        return {"status": "cancelled", "message": "Run cancelled successfully"}
