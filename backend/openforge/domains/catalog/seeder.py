"""Catalog seeder - orchestrates seeding of curated profiles, workflows, and missions."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentProfileModel,
    CapabilityBundleModel,
    MemoryPolicyModel,
    MissionDefinitionModel,
    ModelPolicyModel,
    OutputContractModel,
    SafetyPolicyModel,
    ToolPolicyModel,
    WorkflowDefinitionModel,
)

logger = logging.getLogger(__name__)


def _stringify_uuids(obj: Any) -> Any:
    """Recursively convert UUID objects to strings for JSONB-safe storage."""
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _stringify_uuids(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_stringify_uuids(item) for item in obj]
    return obj


async def _seed_capability_bundles(db: AsyncSession) -> None:
    """Seed curated capability bundle templates idempotently."""
    from openforge.domains.capability_bundles.seed import get_seed_bundle_blueprints

    blueprints = get_seed_bundle_blueprints()
    for blueprint in blueprints:
        slug = blueprint["slug"]
        existing = await db.scalar(
            select(CapabilityBundleModel).where(CapabilityBundleModel.slug == slug)
        )
        if existing is not None:
            continue

        bundle = CapabilityBundleModel(**blueprint)
        db.add(bundle)

    await db.commit()
    logger.info("Seeded %d curated capability bundle templates.", len(blueprints))


async def _seed_model_policies(db: AsyncSession) -> None:
    """Seed curated model policy templates idempotently."""
    from openforge.domains.model_policies.seed import get_seed_model_policy_blueprints

    blueprints = get_seed_model_policy_blueprints()
    for blueprint in blueprints:
        slug = blueprint["slug"]
        existing = await db.scalar(
            select(ModelPolicyModel).where(ModelPolicyModel.slug == slug)
        )
        if existing is not None:
            continue

        policy = ModelPolicyModel(**blueprint)
        db.add(policy)

    await db.commit()
    logger.info("Seeded %d curated model policy templates.", len(blueprints))


async def _seed_memory_policies(db: AsyncSession) -> None:
    """Seed curated memory policy templates idempotently."""
    from openforge.domains.memory_policies.seed import get_seed_memory_policy_blueprints

    blueprints = get_seed_memory_policy_blueprints()
    for blueprint in blueprints:
        slug = blueprint["slug"]
        existing = await db.scalar(
            select(MemoryPolicyModel).where(MemoryPolicyModel.slug == slug)
        )
        if existing is not None:
            continue

        policy = MemoryPolicyModel(**blueprint)
        db.add(policy)

    await db.commit()
    logger.info("Seeded %d curated memory policy templates.", len(blueprints))


async def _seed_output_contracts(db: AsyncSession) -> None:
    """Seed curated output contract templates idempotently."""
    from openforge.domains.output_contracts.seed import get_seed_output_contract_blueprints

    blueprints = get_seed_output_contract_blueprints()
    for blueprint in blueprints:
        slug = blueprint["slug"]
        existing = await db.scalar(
            select(OutputContractModel).where(OutputContractModel.slug == slug)
        )
        if existing is not None:
            continue

        contract = OutputContractModel(**blueprint)
        db.add(contract)

    await db.commit()
    logger.info("Seeded %d curated output contract templates.", len(blueprints))


async def _seed_safety_policies(db: AsyncSession) -> None:
    """Seed curated safety policy templates idempotently."""
    from openforge.domains.policies.seed_safety import get_seed_safety_policy_blueprints

    blueprints = get_seed_safety_policy_blueprints()
    for blueprint in blueprints:
        name = blueprint["name"]
        existing = await db.scalar(
            select(SafetyPolicyModel).where(SafetyPolicyModel.name == name)
        )
        if existing is not None:
            continue

        policy = SafetyPolicyModel(**blueprint)
        db.add(policy)

    await db.commit()
    logger.info("Seeded %d curated safety policy templates.", len(blueprints))


async def _seed_tool_policies(db: AsyncSession) -> None:
    """Seed curated tool policy templates idempotently."""
    from openforge.domains.policies.seed_tool import get_seed_tool_policy_blueprints

    blueprints = get_seed_tool_policy_blueprints()
    for blueprint in blueprints:
        name = blueprint["name"]
        existing = await db.scalar(
            select(ToolPolicyModel).where(ToolPolicyModel.name == name)
        )
        if existing is not None:
            continue

        db.add(ToolPolicyModel(**blueprint))

    await db.commit()
    logger.info("Seeded %d curated tool policies.", len(blueprints))


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

        # Convert UUID objects to strings so JSONB columns
        # (nodes, edges, template_metadata, etc.) can serialize cleanly.
        workflow_data = _stringify_uuids(workflow_data)

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
    seeded = 0
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

        # Convert UUID objects to strings in JSONB fields
        for jsonb_key in ("default_profile_ids", "default_trigger_ids", "output_artifact_types", "tags", "catalog_metadata"):
            if jsonb_key in mission_data:
                mission_data[jsonb_key] = _stringify_uuids(mission_data[jsonb_key])

        try:
            mission = MissionDefinitionModel(**mission_data)
            db.add(mission)
            await db.flush()
            seeded += 1
        except Exception:
            logger.warning("Failed to seed mission '%s', skipping.", slug, exc_info=True)
            await db.rollback()

    await db.commit()
    logger.info("Seeded %d/%d curated mission templates.", seeded, len(blueprints))


async def seed_curated_catalog(db: AsyncSession) -> None:
    """Seed all curated catalog entries."""
    await _seed_capability_bundles(db)
    await _seed_model_policies(db)
    await _seed_memory_policies(db)
    await _seed_output_contracts(db)
    await _seed_safety_policies(db)
    await _seed_tool_policies(db)
    await _seed_profiles(db)
    await _seed_workflows(db)
    await _seed_missions(db)
