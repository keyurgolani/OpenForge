"""Mission domain service."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    ArtifactModel,
    MissionDefinitionModel,
    RunModel,
)
from openforge.domains.common.crud import CrudDomainService


class MissionService(CrudDomainService):
    """Service for managing mission definitions."""

    model = MissionDefinitionModel

    async def list_missions(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ):
        """List missions with optional workspace and status filters."""
        filters: dict[str, Any] = {}
        if workspace_id is not None:
            filters["workspace_id"] = workspace_id
        if status is not None:
            filters["status"] = status
        return await self.list_records(skip=skip, limit=limit, filters=filters or None)

    async def get_mission(self, mission_id: UUID):
        """Get a single mission by ID."""
        return await self.get_record(mission_id)

    async def create_mission(self, mission_data: dict):
        """Create a new mission definition."""
        return await self.create_record(mission_data)

    async def update_mission(self, mission_id: UUID, mission_data: dict):
        """Update an existing mission definition."""
        return await self.update_record(mission_id, mission_data)

    async def delete_mission(self, mission_id: UUID):
        """Delete a mission definition."""
        return await self.delete_record(mission_id)

    async def list_missions_by_workflow(
        self,
        workflow_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ):
        """List missions that use a specific workflow."""
        return await self.list_records(
            skip=skip,
            limit=limit,
            filters={"workflow_id": workflow_id},
        )

    async def get_mission_runs(
        self,
        mission_id: UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """Get runs associated with a mission."""
        query = (
            select(RunModel)
            .where(RunModel.mission_id == mission_id)
            .order_by(desc(RunModel.created_at))
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        rows = result.scalars().all()

        count_query = (
            select(func.count())
            .select_from(RunModel)
            .where(RunModel.mission_id == mission_id)
        )
        total = await self.db.scalar(count_query) or 0

        runs = []
        for row in rows:
            runs.append({
                "id": row.id,
                "run_type": row.run_type,
                "workflow_id": row.workflow_id,
                "mission_id": row.mission_id,
                "trigger_id": row.trigger_id,
                "workspace_id": row.workspace_id,
                "status": row.status,
                "input_payload": row.input_payload,
                "output_payload": row.output_payload,
                "error_message": row.error_message,
                "started_at": row.started_at,
                "completed_at": row.completed_at,
                "created_at": row.created_at,
            })
        return runs, int(total)

    async def get_mission_artifacts(
        self,
        mission_id: UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """Get artifacts produced by a mission."""
        query = (
            select(ArtifactModel)
            .where(ArtifactModel.source_mission_id == mission_id)
            .order_by(desc(ArtifactModel.created_at))
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        rows = result.scalars().all()

        count_query = (
            select(func.count())
            .select_from(ArtifactModel)
            .where(ArtifactModel.source_mission_id == mission_id)
        )
        total = await self.db.scalar(count_query) or 0

        artifacts = []
        for row in rows:
            artifacts.append({
                "id": row.id,
                "artifact_type": row.artifact_type,
                "workspace_id": row.workspace_id,
                "source_run_id": row.source_run_id,
                "source_mission_id": row.source_mission_id,
                "title": row.title,
                "summary": row.summary,
                "status": row.status,
                "created_at": row.created_at,
            })
        return artifacts, int(total)

    async def update_health_metadata(
        self,
        mission_id: UUID,
        health_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Update health-related fields on a mission."""
        instance = await self.db.get(MissionDefinitionModel, mission_id)
        if instance is None:
            return None

        allowed_fields = {
            "last_run_at",
            "last_success_at",
            "last_failure_at",
            "last_triggered_at",
            "health_status",
            "last_error_summary",
        }
        for key, value in health_data.items():
            if key in allowed_fields:
                setattr(instance, key, value)

        await self.db.commit()
        await self.db.refresh(instance)
        return self._serialize(instance)
