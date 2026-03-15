"""
Mission lifecycle service.

Manages mission status transitions with validation and side effects
such as enabling/disabling associated triggers.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.common.time import utc_now
from openforge.db.models import MissionDefinitionModel, TriggerDefinitionModel

logger = logging.getLogger(__name__)


class MissionLifecycleService:
    """Manages mission status transitions."""

    VALID_TRANSITIONS: dict[str, set[str]] = {
        "draft": {"active"},
        "active": {"paused", "disabled", "failed", "archived"},
        "paused": {"active", "disabled", "archived"},
        "disabled": {"active", "archived"},
        "failed": {"active", "disabled", "archived"},
        "archived": set(),
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    async def transition(
        self,
        mission_id: UUID,
        target_status: str,
        reason: Optional[str] = None,
    ) -> dict:
        """
        Transition a mission to a new status.

        Validates that the transition is allowed, updates the status,
        and persists the change.
        """
        mission = await self.db.get(MissionDefinitionModel, mission_id)
        if mission is None:
            raise ValueError(f"Mission not found: {mission_id}")

        current = mission.status
        allowed = self.VALID_TRANSITIONS.get(current, set())

        if target_status not in allowed:
            raise ValueError(
                f"Invalid transition from '{current}' to '{target_status}'. "
                f"Allowed targets: {', '.join(sorted(allowed)) or 'none'}"
            )

        mission.status = target_status
        mission.updated_at = utc_now()

        if reason and target_status in {"disabled", "failed"}:
            mission.last_error_summary = reason

        await self.db.flush()

        logger.info(
            "Mission %s transitioned: %s -> %s (reason=%s)",
            mission_id,
            current,
            target_status,
            reason,
        )

        return {
            "mission_id": mission.id,
            "previous_status": current,
            "status": mission.status,
        }

    async def pause_mission(self, mission_id: UUID) -> dict:
        """Pause a mission and disable associated triggers."""
        result = await self.transition(mission_id, "paused")
        await self._set_triggers_enabled(mission_id, enabled=False)
        await self.db.commit()
        return result

    async def resume_mission(self, mission_id: UUID) -> dict:
        """Resume a paused mission and re-enable associated triggers."""
        result = await self.transition(mission_id, "active")
        await self._set_triggers_enabled(mission_id, enabled=True)
        await self.db.commit()
        return result

    async def disable_mission(
        self,
        mission_id: UUID,
        reason: Optional[str] = None,
    ) -> dict:
        """Disable a mission, disabling all associated triggers."""
        result = await self.transition(mission_id, "disabled", reason=reason)
        await self._set_triggers_enabled(mission_id, enabled=False)
        await self.db.commit()
        return result

    async def activate_mission(self, mission_id: UUID) -> dict:
        """Activate a mission from draft status."""
        result = await self.transition(mission_id, "active")
        await self.db.commit()
        return result

    async def _set_triggers_enabled(
        self,
        mission_id: UUID,
        enabled: bool,
    ) -> None:
        """Enable or disable all triggers that target this mission."""
        mission = await self.db.get(MissionDefinitionModel, mission_id)
        if mission is None:
            return

        trigger_ids = mission.default_trigger_ids or []
        if not trigger_ids:
            return

        stmt = (
            update(TriggerDefinitionModel)
            .where(TriggerDefinitionModel.id.in_(trigger_ids))
            .values(is_enabled=enabled, updated_at=utc_now())
        )
        await self.db.execute(stmt)
        await self.db.flush()

        logger.info(
            "Set %d triggers %s for mission %s",
            len(trigger_ids),
            "enabled" if enabled else "disabled",
            mission_id,
        )
