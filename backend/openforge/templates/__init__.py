"""Template seeding for built-in agent and automation templates."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.domains.agents.service import AgentService
from openforge.domains.automations.service import AutomationService

logger = logging.getLogger("openforge.templates")

_TEMPLATES_DIR = Path(__file__).parent
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)", re.DOTALL)
_CONSTRAINTS_RE = re.compile(
    r"##\s*Constraints\s*\n((?:[-*]\s+.+\n?)+)", re.IGNORECASE,
)


def _parse_template_md(content: str) -> dict[str, Any]:
    """Parse a template .md file (YAML frontmatter + markdown body) into agent fields."""
    match = _FRONTMATTER_RE.match(content)
    if not match:
        return {"system_prompt": content.strip()}

    frontmatter_str, body = match.group(1), match.group(2)
    try:
        fm = yaml.safe_load(frontmatter_str) or {}
    except yaml.YAMLError:
        return {"system_prompt": content.strip()}

    if not isinstance(fm, dict):
        return {"system_prompt": content.strip()}

    # Remove constraints section from body to get clean system_prompt
    system_prompt = _CONSTRAINTS_RE.sub("", body).strip()

    # Build tools_config list
    tools_raw = fm.get("tools") or []
    tools_config: list[dict[str, Any]] = []
    for item in tools_raw:
        if isinstance(item, str):
            tools_config.append({"name": item})
        elif isinstance(item, dict):
            tools_config.append(item)

    # Build parameters list
    parameters = fm.get("parameters") or []

    # Build output_definitions
    outputs_raw = fm.get("outputs")
    if outputs_raw and isinstance(outputs_raw, list):
        output_definitions = [o for o in outputs_raw if isinstance(o, dict)]
    else:
        output_definitions = [{"key": "output", "type": "text"}]

    # Build llm_config from model section
    model_raw = fm.get("model") or {}
    llm_config: dict[str, Any] = {}
    if isinstance(model_raw, dict):
        if "temperature" in model_raw:
            llm_config["temperature"] = model_raw["temperature"]
        if "max_tokens" in model_raw:
            llm_config["max_tokens"] = model_raw["max_tokens"]
        if "allow_override" in model_raw:
            llm_config["allow_override"] = model_raw["allow_override"]
        if "default" in model_raw:
            llm_config["default_model"] = model_raw["default"]
        if "provider" in model_raw:
            llm_config["provider"] = model_raw["provider"]

    # Build memory_config
    memory_raw = fm.get("memory") or {}
    memory_config: dict[str, Any] = {}
    if isinstance(memory_raw, dict):
        for key in ("history_limit", "attachment_support", "auto_bookmark_urls", "mention_support"):
            if key in memory_raw:
                memory_config[key] = memory_raw[key]

    return {
        "name": fm.get("name", "untitled"),
        "slug": fm.get("slug", "untitled"),
        "description": fm.get("description") or "",
        "icon": fm.get("icon"),
        "tags": fm.get("tags") or [],
        "system_prompt": system_prompt,
        "llm_config": llm_config,
        "tools_config": tools_config,
        "memory_config": memory_config,
        "parameters": parameters,
        "output_definitions": output_definitions,
    }


async def seed_agent_templates(db: AsyncSession) -> None:
    """Seed built-in agent templates from .md files."""
    agents_dir = _TEMPLATES_DIR / "agents"
    if not agents_dir.exists():
        return

    service = AgentService(db)
    for md_file in sorted(agents_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            fields = _parse_template_md(content)
            slug = fields.get("slug", md_file.stem)

            # Check if template already exists by slug
            existing = await service.get_agent_by_slug(slug)
            if existing is not None:
                # Update fields if the template file has changed
                await service.update_agent(existing["id"], fields)
                logger.info("Updated agent template: %s", slug)
                continue

            await service.create_agent(fields)
            logger.info("Seeded agent template: %s", slug)
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
                "tags": data.get("tags", []),
                "status": "active",
                "is_template": True,
                "is_system": True,
            })
            logger.info("Seeded automation template: %s", slug)
        except Exception as exc:
            logger.warning("Failed to seed automation template %s: %s", yaml_file.name, exc)
