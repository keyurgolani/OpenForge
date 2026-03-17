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
        is_system: bool | None = None,
        is_template: bool | None = None,
        is_featured: bool | None = None,
        tags: list[str] | None = None,
    ):
        """List missions with optional filters."""
        query = select(MissionDefinitionModel).order_by(
            MissionDefinitionModel.sort_priority.desc(),
            MissionDefinitionModel.updated_at.desc(),
        )
        count_query = select(func.count()).select_from(MissionDefinitionModel)

        if workspace_id is not None:
            query = query.where(MissionDefinitionModel.workspace_id == workspace_id)
            count_query = count_query.where(MissionDefinitionModel.workspace_id == workspace_id)
        if status is not None:
            query = query.where(MissionDefinitionModel.status == status)
            count_query = count_query.where(MissionDefinitionModel.status == status)
        if is_system is not None:
            query = query.where(MissionDefinitionModel.is_system == is_system)
            count_query = count_query.where(MissionDefinitionModel.is_system == is_system)
        if is_template is not None:
            query = query.where(MissionDefinitionModel.is_template == is_template)
            count_query = count_query.where(MissionDefinitionModel.is_template == is_template)
        if is_featured is not None:
            query = query.where(MissionDefinitionModel.is_featured == is_featured)
            count_query = count_query.where(MissionDefinitionModel.is_featured == is_featured)
        if tags:
            for tag in tags:
                query = query.where(MissionDefinitionModel.tags.contains([tag]))
                count_query = count_query.where(MissionDefinitionModel.tags.contains([tag]))

        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

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

    # ── Template/Catalog operations ──

    async def list_templates(
        self,
        skip: int = 0,
        limit: int = 100,
        tags: list[str] | None = None,
        is_featured: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """List mission templates (is_template=True)."""
        return await self.list_missions(
            skip=skip,
            limit=limit,
            is_template=True,
            tags=tags,
            is_featured=is_featured,
        )

    async def get_template(self, mission_id: UUID) -> dict[str, Any] | None:
        """Get a single mission template."""
        mission = await self.get_mission(mission_id)
        if mission is None or not mission.get("is_template"):
            return None
        return mission

    async def _unique_slug(self, base_slug: str) -> str:
        """Return a slug guaranteed to be unique by appending a numeric suffix."""
        candidate = base_slug
        suffix = 0
        while True:
            exists = await self.db.scalar(
                select(MissionDefinitionModel.id).where(MissionDefinitionModel.slug == candidate).limit(1)
            )
            if exists is None:
                return candidate
            suffix += 1
            candidate = f"{base_slug}-{suffix}"

    async def clone_template(self, mission_id: UUID, clone_data: dict[str, Any]) -> dict[str, Any] | None:
        """Clone a mission template into a workspace-local mission."""
        template = await self.get_template(mission_id)
        if template is None:
            return None

        desired_slug = clone_data.get("slug") or f"{template['slug']}-clone"
        unique_slug = await self._unique_slug(desired_slug)

        clone_payload = {
            "workspace_id": clone_data.get("workspace_id"),
            "name": clone_data.get("name") or template["name"],
            "slug": unique_slug,
            "description": template.get("description"),
            "workflow_id": template["workflow_id"],
            "workflow_version_id": template.get("workflow_version_id"),
            "default_profile_ids": [str(x) for x in (template.get("default_profile_ids") or [])],
            "default_trigger_ids": [],
            "autonomy_mode": template.get("autonomy_mode", "supervised"),
            "approval_policy_id": template.get("approval_policy_id"),
            "budget_policy_id": template.get("budget_policy_id"),
            "output_artifact_types": list(template.get("output_artifact_types") or []),
            "is_system": False,
            "is_template": False,
            "recommended_use_case": template.get("recommended_use_case"),
            "status": "draft",
            "tags": list(template.get("tags") or []),
            "icon": template.get("icon"),
            "catalog_metadata": {
                **(template.get("catalog_metadata") or {}),
                "cloned_from_template": str(mission_id),
            },
        }
        return await self.create_mission(clone_payload)

    # ── Related queries ──

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
