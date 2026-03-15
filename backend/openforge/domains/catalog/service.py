"""Catalog domain service - unified discovery and validation across entity types."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentProfileModel,
    MissionDefinitionModel,
    WorkflowDefinitionModel,
)

from .schemas import CatalogItemResponse, CatalogReadinessResponse
from .types import CatalogItemType


class CatalogService:
    """Unified catalog browsing, filtering, and readiness checks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _profile_to_catalog_item(self, row: AgentProfileModel) -> CatalogItemResponse:
        metadata = row.catalog_metadata or {}
        return CatalogItemResponse(
            id=row.id,
            catalog_type=CatalogItemType.PROFILE,
            name=row.name,
            slug=row.slug,
            description=row.description,
            icon=row.icon,
            tags=row.tags or [],
            is_featured=row.is_featured,
            is_recommended=row.is_recommended,
            sort_priority=row.sort_priority,
            difficulty_level=metadata.get("difficulty_level"),
            setup_complexity=metadata.get("setup_complexity"),
            autonomy_level=None,
            recommended_use_cases=metadata.get("recommended_use_cases", []),
            expected_outputs=metadata.get("expected_outputs", []),
            example_inputs=metadata.get("example_inputs", []),
            clone_behavior=metadata.get("clone_behavior", "clone_only"),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _workflow_to_catalog_item(self, row: WorkflowDefinitionModel) -> CatalogItemResponse:
        metadata = row.template_metadata or {}
        return CatalogItemResponse(
            id=row.id,
            catalog_type=CatalogItemType.WORKFLOW,
            name=row.name,
            slug=row.slug,
            description=row.description,
            icon=row.icon,
            tags=row.tags or [],
            is_featured=row.is_featured,
            is_recommended=row.is_recommended,
            sort_priority=row.sort_priority,
            difficulty_level=metadata.get("difficulty_level"),
            setup_complexity=metadata.get("setup_complexity"),
            autonomy_level=None,
            recommended_use_cases=metadata.get("recommended_use_cases", []),
            expected_outputs=metadata.get("expected_outputs", []),
            example_inputs=metadata.get("example_inputs", []),
            clone_behavior=metadata.get("clone_behavior", "clone_only"),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _mission_to_catalog_item(self, row: MissionDefinitionModel) -> CatalogItemResponse:
        metadata = row.catalog_metadata or {}
        return CatalogItemResponse(
            id=row.id,
            catalog_type=CatalogItemType.MISSION,
            name=row.name,
            slug=row.slug,
            description=row.description,
            icon=getattr(row, "icon", None),
            tags=row.tags or [],
            is_featured=row.is_featured,
            is_recommended=row.is_recommended,
            sort_priority=row.sort_priority,
            difficulty_level=metadata.get("difficulty_level"),
            setup_complexity=metadata.get("setup_complexity"),
            autonomy_level=row.autonomy_mode,
            recommended_use_cases=metadata.get("recommended_use_cases", []),
            expected_outputs=metadata.get("expected_outputs", []),
            example_inputs=metadata.get("example_inputs", []),
            clone_behavior=metadata.get("clone_behavior", "clone_only"),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    async def list_catalog(
        self,
        skip: int = 0,
        limit: int = 100,
        catalog_type: CatalogItemType | None = None,
        tags: list[str] | None = None,
        is_featured: bool | None = None,
    ) -> tuple[list[CatalogItemResponse], int]:
        """List catalog items across all types."""
        items: list[CatalogItemResponse] = []

        include_profiles = catalog_type is None or catalog_type == CatalogItemType.PROFILE
        include_workflows = catalog_type is None or catalog_type == CatalogItemType.WORKFLOW
        include_missions = catalog_type is None or catalog_type == CatalogItemType.MISSION

        if include_profiles:
            query = select(AgentProfileModel).where(
                AgentProfileModel.is_template == True,
                AgentProfileModel.status == "active",
            )
            if is_featured is not None:
                query = query.where(AgentProfileModel.is_featured == is_featured)
            if tags:
                for tag in tags:
                    query = query.where(AgentProfileModel.tags.contains([tag]))
            rows = (await self.db.execute(query)).scalars().all()
            items.extend(self._profile_to_catalog_item(row) for row in rows)

        if include_workflows:
            query = select(WorkflowDefinitionModel).where(
                WorkflowDefinitionModel.is_template == True,
                WorkflowDefinitionModel.status == "active",
            )
            if is_featured is not None:
                query = query.where(WorkflowDefinitionModel.is_featured == is_featured)
            if tags:
                for tag in tags:
                    query = query.where(WorkflowDefinitionModel.tags.contains([tag]))
            rows = (await self.db.execute(query)).scalars().all()
            items.extend(self._workflow_to_catalog_item(row) for row in rows)

        if include_missions:
            query = select(MissionDefinitionModel).where(
                MissionDefinitionModel.is_template == True,
            )
            if is_featured is not None:
                query = query.where(MissionDefinitionModel.is_featured == is_featured)
            if tags:
                for tag in tags:
                    query = query.where(MissionDefinitionModel.tags.contains([tag]))
            rows = (await self.db.execute(query)).scalars().all()
            items.extend(self._mission_to_catalog_item(row) for row in rows)

        # Sort by featured first, then sort_priority desc, then name
        items.sort(key=lambda x: (-int(x.is_featured), -x.sort_priority, x.name))
        total = len(items)
        return items[skip : skip + limit], total

    async def check_readiness(
        self,
        catalog_type: CatalogItemType,
        item_id: UUID,
    ) -> CatalogReadinessResponse:
        """Check whether a catalog template is ready to be cloned/used."""
        missing: list[str] = []
        requirements: list[str] = []
        warnings: list[str] = []

        if catalog_type == CatalogItemType.PROFILE:
            profile = await self.db.get(AgentProfileModel, item_id)
            if profile is None:
                return CatalogReadinessResponse(
                    catalog_type=catalog_type,
                    item_id=item_id,
                    is_ready=False,
                    missing_dependencies=["Profile not found"],
                )
            if not profile.system_prompt_ref:
                missing.append("system_prompt_ref")
            if not profile.capability_bundle_ids:
                requirements.append("At least one capability bundle is recommended")

        elif catalog_type == CatalogItemType.WORKFLOW:
            workflow = await self.db.get(WorkflowDefinitionModel, item_id)
            if workflow is None:
                return CatalogReadinessResponse(
                    catalog_type=catalog_type,
                    item_id=item_id,
                    is_ready=False,
                    missing_dependencies=["Workflow not found"],
                )
            if not workflow.current_version_id:
                missing.append("No active workflow version")

        elif catalog_type == CatalogItemType.MISSION:
            mission = await self.db.get(MissionDefinitionModel, item_id)
            if mission is None:
                return CatalogReadinessResponse(
                    catalog_type=catalog_type,
                    item_id=item_id,
                    is_ready=False,
                    missing_dependencies=["Mission not found"],
                )
            workflow = await self.db.get(WorkflowDefinitionModel, mission.workflow_id) if mission.workflow_id else None
            if workflow is None:
                missing.append("Linked workflow not found")
            metadata = mission.catalog_metadata or {}
            if metadata.get("manual_first_recommended"):
                warnings.append("Manual first run is recommended before enabling automation")
            if metadata.get("requires_approval_review"):
                requirements.append("Review and configure approval policies before activation")

        return CatalogReadinessResponse(
            catalog_type=catalog_type,
            item_id=item_id,
            is_ready=len(missing) == 0,
            missing_dependencies=missing,
            setup_requirements=requirements,
            warnings=warnings,
        )
