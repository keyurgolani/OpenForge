"""Phase 12 catalog seeder - orchestrates seeding of curated profiles, workflows, and missions."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentProfileModel,
    MissionDefinitionModel,
    WorkflowDefinitionModel,
)

logger = logging.getLogger(__name__)


async def _seed_profiles(db: AsyncSession) -> None:
    """Seed curated profile templates idempotently."""
    from openforge.domains.profiles.seed import get_seed_profile_blueprints

    blueprints = get_seed_profile_blueprints()
    for blueprint in blueprints:
        slug = blueprint["slug"]
        existing = await db.scalar(
            select(AgentProfileModel).where(AgentProfileModel.slug == slug)
        )
        if existing is not None:
            continue

        profile = AgentProfileModel(**blueprint)
        db.add(profile)

    await db.commit()
    logger.info("Seeded %d curated profile templates.", len(blueprints))


async def _seed_workflows(db: AsyncSession) -> None:
    """Seed curated workflow templates idempotently."""
    from openforge.domains.workflows.seed import get_seed_workflow_blueprints
    from openforge.domains.workflows.service import WorkflowService

    service = WorkflowService(db)
    blueprints = get_seed_workflow_blueprints()

    for blueprint in blueprints:
        slug = blueprint["slug"]
        workflow_data = dict(blueprint["workflow"])
        existing = await db.scalar(
            select(WorkflowDefinitionModel).where(
                WorkflowDefinitionModel.slug == slug
            )
        )
        if existing is not None:
            continue

        # Pull tags from template_metadata into top-level if not already set
        if not workflow_data.get("tags"):
            meta_tags = (workflow_data.get("template_metadata") or {}).get("tags", [])
            if meta_tags:
                workflow_data["tags"] = meta_tags

        try:
            await service.create_workflow(workflow_data)
        except Exception:
            logger.warning("Failed to seed workflow '%s', skipping.", slug, exc_info=True)
            await db.rollback()

    logger.info("Seeded %d curated workflow templates.", len(blueprints))


async def _seed_missions(db: AsyncSession) -> None:
    """Seed curated mission templates idempotently."""
    from openforge.domains.missions.seed import get_seed_mission_blueprints

    blueprints = get_seed_mission_blueprints()
    for blueprint in blueprints:
        slug = blueprint["slug"]
        existing = await db.scalar(
            select(MissionDefinitionModel).where(
                MissionDefinitionModel.slug == slug
            )
        )
        if existing is not None:
            continue

        mission_data = dict(blueprint["mission"])
        # Merge catalog metadata from top-level blueprint keys into mission data
        if "tags" in blueprint:
            mission_data["tags"] = blueprint["tags"]
        if "catalog_metadata" in blueprint:
            mission_data["catalog_metadata"] = blueprint["catalog_metadata"]
        mission = MissionDefinitionModel(**mission_data)
        db.add(mission)

    await db.commit()
    logger.info("Seeded %d curated mission templates.", len(blueprints))


async def seed_curated_catalog(db: AsyncSession) -> None:
    """Seed all Phase 12 curated catalog entries."""
    await _seed_profiles(db)
    await _seed_workflows(db)
    await _seed_missions(db)
