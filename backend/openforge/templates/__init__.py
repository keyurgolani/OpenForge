"""Template seeding for built-in agent and automation templates."""

from __future__ import annotations

import logging
from pathlib import Path

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.domains.agents.blueprint import parse_agent_md
from openforge.domains.agents.service import AgentService
from openforge.domains.automations.service import AutomationService

logger = logging.getLogger("openforge.templates")

_TEMPLATES_DIR = Path(__file__).parent


async def seed_agent_templates(db: AsyncSession) -> None:
    """Seed built-in agent templates from .md files."""
    agents_dir = _TEMPLATES_DIR / "agents"
    if not agents_dir.exists():
        return

    service = AgentService(db)
    for md_file in sorted(agents_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            blueprint, _ = parse_agent_md(content)

            # Check if template already exists by slug
            existing = await service.get_agent_by_slug(blueprint.slug)
            if existing is not None:
                continue

            await service.create_agent({
                "name": blueprint.name,
                "slug": blueprint.slug,
                "description": blueprint.description or "",
                "blueprint_md": content,
                "mode": blueprint.mode,
                "icon": blueprint.icon,
                "tags": blueprint.tags,
                "status": "active",
                "is_template": True,
                "is_system": True,
            })
            logger.info("Seeded agent template: %s", blueprint.slug)
        except Exception as exc:
            logger.warning("Failed to seed agent template %s: %s", md_file.name, exc)


async def seed_automation_templates(db: AsyncSession) -> None:
    """Seed built-in automation templates from .yaml files."""
    automations_dir = _TEMPLATES_DIR / "automations"
    if not automations_dir.exists():
        return

    agent_service = AgentService(db)
    automation_service = AutomationService(db)

    for yaml_file in sorted(automations_dir.glob("*.yaml")):
        try:
            data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue

            slug = data["slug"]

            # Check if automation template already exists by slug
            from sqlalchemy import select
            from openforge.db.models import AutomationModel
            existing = await db.scalar(
                select(AutomationModel).where(AutomationModel.slug == slug).limit(1)
            )
            if existing is not None:
                continue

            # Look up the referenced agent by slug
            agent_slug = data.get("agent_slug")
            agent = await agent_service.get_agent_by_slug(agent_slug)
            if agent is None:
                logger.warning(
                    "Skipping automation template %s: agent '%s' not found",
                    slug, agent_slug,
                )
                continue

            await automation_service.create_automation({
                "name": data["name"],
                "slug": slug,
                "description": data.get("description", ""),
                "agent_id": agent["id"],
                "trigger_config": data.get("trigger_config", {}),
                "budget_config": data.get("budget_config", {}),
                "output_config": data.get("output_config", {}),
                "tags": data.get("tags", []),
                "status": "active",
                "is_template": True,
                "is_system": True,
            })
            logger.info("Seeded automation template: %s", slug)
        except Exception as exc:
            logger.warning("Failed to seed automation template %s: %s", yaml_file.name, exc)
