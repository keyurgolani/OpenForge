"""Mission service — manages the mission lifecycle and OODA cycles."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import MissionCycleModel, MissionModel, Workspace

logger = logging.getLogger("openforge.missions")


class MissionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── CRUD ──────────────────────────────────────────────────────────

    async def create_mission(self, data: dict) -> MissionModel:
        """Create a new mission in draft status."""
        slug = self._generate_slug(data["name"])
        slug = await self._ensure_unique_slug(slug)

        mission = MissionModel(
            name=data["name"],
            slug=slug,
            description=data.get("description"),
            icon=data.get("icon"),
            tags=data.get("tags", []),
            goal=data["goal"],
            directives=data.get("directives", []),
            constraints=data.get("constraints", []),
            rubric=data.get("rubric", []),
            termination_conditions=data.get("termination_conditions", []),
            autonomous_agent_id=data["autonomous_agent_id"],
            agent_access=data.get("agent_access", {"mode": "all"}),
            tool_overrides=data.get("tool_overrides"),
            phase_sinks=data.get("phase_sinks", {}),
            cadence=data.get("cadence"),
            budget=data.get("budget"),
            status="draft",
        )
        self.db.add(mission)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(mission)
        return mission

    async def get_mission(self, mission_id: UUID) -> MissionModel | None:
        return await self.db.get(MissionModel, mission_id)

    async def list_missions(
        self,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[MissionModel], int]:
        query = select(MissionModel)
        count_query = select(func.count()).select_from(MissionModel)

        if status:
            query = query.where(MissionModel.status == status)
            count_query = count_query.where(MissionModel.status == status)

        query = query.order_by(MissionModel.created_at.desc()).offset(skip).limit(limit)
        total = await self.db.scalar(count_query) or 0
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def update_mission(self, mission_id: UUID, data: dict) -> MissionModel:
        mission = await self._get(mission_id)
        if mission.status not in ("draft", "paused"):
            raise ValueError(f"Cannot update mission with status '{mission.status}'")

        for key, value in data.items():
            if value is not None:
                setattr(mission, key, value)

        await self.db.commit()
        await self.db.refresh(mission)
        return mission

    async def delete_mission(self, mission_id: UUID) -> None:
        mission = await self._get(mission_id)
        if mission.status != "draft":
            raise ValueError(f"Cannot delete mission with status '{mission.status}'")

        await self.db.delete(mission)
        await self.db.commit()

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def activate(self, mission_id: UUID) -> MissionModel:
        """Activate a draft or paused mission."""
        mission = await self._get(mission_id)
        if mission.status not in ("draft", "paused"):
            raise ValueError(f"Cannot activate mission with status '{mission.status}'")

        now = datetime.now(timezone.utc)

        # Provision workspace if not already attached
        if not mission.workspace_id:
            workspace = Workspace(
                name=f"Mission: {mission.name}",
                ownership_type="mission",
                is_readonly_ui=True,
                auto_teardown=True,
            )
            self.db.add(workspace)
            await self.db.flush()
            mission.workspace_id = workspace.id

        mission.status = "active"
        mission.next_cycle_at = now
        mission.activated_at = now
        await self.db.commit()
        await self.db.refresh(mission)
        return mission

    async def pause(self, mission_id: UUID) -> MissionModel:
        """Pause an active mission."""
        mission = await self._get(mission_id)
        if mission.status != "active":
            raise ValueError(f"Cannot pause mission with status '{mission.status}'")

        mission.status = "paused"
        mission.next_cycle_at = None
        await self.db.commit()
        await self.db.refresh(mission)
        return mission

    async def terminate(self, mission_id: UUID) -> MissionModel:
        """Terminate a mission. Handles workspace cleanup."""
        mission = await self._get(mission_id)

        now = datetime.now(timezone.utc)
        mission.status = "terminated"
        mission.next_cycle_at = None
        mission.completed_at = now

        # Handle workspace cleanup
        if mission.workspace_id:
            workspace = await self.db.get(Workspace, mission.workspace_id)
            if workspace:
                if workspace.auto_teardown:
                    from openforge.services.workspace_service import workspace_service
                    await workspace_service.delete_workspace(self.db, workspace.id)
                    mission.workspace_id = None
                else:
                    # Promote to regular user workspace
                    workspace.ownership_type = "user"
                    workspace.is_readonly_ui = False
                    workspace.name = workspace.name.replace("Mission: ", "[Archived] ")

        await self.db.commit()
        await self.db.refresh(mission)
        return mission

    async def promote_workspace(self, mission_id: UUID) -> dict:
        """Convert a mission workspace into a regular user workspace."""
        mission = await self._get(mission_id)
        if not mission.workspace_id:
            raise ValueError("Mission has no workspace")

        workspace = await self.db.get(Workspace, mission.workspace_id)
        if not workspace:
            raise ValueError("Mission workspace not found")

        workspace.ownership_type = "user"
        workspace.is_readonly_ui = False
        workspace.auto_teardown = False
        workspace.name = workspace.name.replace("Mission: ", "")

        mission.workspace_id = None
        await self.db.commit()

        return {
            "workspace_id": workspace.id,
            "workspace_name": workspace.name,
        }

    # ── Cycles ────────────────────────────────────────────────────────

    async def list_cycles(
        self,
        mission_id: UUID,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[MissionCycleModel], int]:
        # Ensure mission exists
        await self._get(mission_id)

        query = select(MissionCycleModel).where(MissionCycleModel.mission_id == mission_id)
        count_query = (
            select(func.count()).select_from(MissionCycleModel)
            .where(MissionCycleModel.mission_id == mission_id)
        )

        if status:
            query = query.where(MissionCycleModel.status == status)
            count_query = count_query.where(MissionCycleModel.status == status)

        query = query.order_by(MissionCycleModel.cycle_number.desc()).offset(skip).limit(limit)
        total = await self.db.scalar(count_query) or 0
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_cycle(self, mission_id: UUID, cycle_id: UUID) -> MissionCycleModel | None:
        # Ensure mission exists
        await self._get(mission_id)

        query = (
            select(MissionCycleModel)
            .where(MissionCycleModel.id == cycle_id)
            .where(MissionCycleModel.mission_id == mission_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    # ── Helpers ───────────────────────────────────────────────────────

    async def _get(self, mission_id: UUID) -> MissionModel:
        mission = await self.db.get(MissionModel, mission_id)
        if not mission:
            raise ValueError(f"Mission {mission_id} not found")
        return mission

    def _generate_slug(self, name: str) -> str:
        """Generate a URL-safe slug from a name."""
        slug = name.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s]+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        return slug.strip("-")[:100]

    async def _ensure_unique_slug(self, slug: str) -> str:
        """Append a numeric suffix if the slug already exists."""
        base_slug = slug
        counter = 1
        while True:
            exists = await self.db.scalar(
                select(func.count()).select_from(MissionModel)
                .where(MissionModel.slug == slug)
            )
            if not exists:
                return slug
            slug = f"{base_slug}-{counter}"
            counter += 1


mission_service = MissionService
