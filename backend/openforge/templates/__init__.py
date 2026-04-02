"""Template seeding for built-in agent, automation, and skill templates."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
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


# ── Slugs that previously shipped as built-in templates but have been removed.
# On startup we delete these from the DB so the UI doesn't show stale entries.
_RETIRED_AGENT_SLUGS = [
    "chat-assistant",
    "code-reviewer",
    "team-coordinator",
    "change-watcher",
    "research-worker",
]

_RETIRED_AUTOMATION_SLUGS = [
    "daily-digest",
    "weekly-report",
    "knowledge-watcher",
]


async def seed_agent_templates(db: AsyncSession) -> None:
    """Seed built-in agent templates from .md files."""
    agents_dir = _TEMPLATES_DIR / "agents"
    if not agents_dir.exists():
        return

    service = AgentService(db)

    # Remove retired templates
    for slug in _RETIRED_AGENT_SLUGS:
        existing = await service.get_agent_by_slug(slug)
        if existing is not None:
            await service.delete_agent(existing["id"])
            logger.info("Removed retired agent template: %s", slug)

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
    """Seed built-in automation templates from .yaml files.

    Supports both simple (single agent_slug) and rich (multi-node DAG)
    automation templates.  Rich templates define ``nodes``, ``wiring``,
    and optional ``sinks`` which are persisted via the graph API.
    """
    automations_dir = _TEMPLATES_DIR / "automations"
    if not automations_dir.exists():
        return

    from openforge.db.models import AutomationModel

    agent_service = AgentService(db)
    automation_service = AutomationService(db)

    # Remove retired automation templates
    for slug in _RETIRED_AUTOMATION_SLUGS:
        existing = await db.scalar(
            select(AutomationModel).where(AutomationModel.slug == slug).limit(1)
        )
        if existing is not None:
            await automation_service.delete_automation(existing.id)
            logger.info("Removed retired automation template: %s", slug)

    for yaml_file in sorted(automations_dir.glob("*.yaml")):
        try:
            data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue

            slug = data["slug"]

            # Check if automation template already exists by slug
            existing = await db.scalar(
                select(AutomationModel).where(AutomationModel.slug == slug).limit(1)
            )
            if existing is not None:
                continue

            # Create the automation record
            automation = await automation_service.create_automation({
                "name": data["name"],
                "slug": slug,
                "description": data.get("description", ""),
                "tags": data.get("tags", []),
                "status": "active",
                "is_template": True,
                "is_system": True,
            })

            # If this is a rich multi-node template, build the graph
            nodes_data = data.get("nodes", [])
            if nodes_data:
                await _seed_automation_graph(
                    db, agent_service, automation_service,
                    automation["id"], data,
                )

            logger.info("Seeded automation template: %s", slug)
        except Exception as exc:
            logger.warning("Failed to seed automation template %s: %s", yaml_file.name, exc)


async def _seed_automation_graph(
    db: AsyncSession,
    agent_service: AgentService,
    automation_service: AutomationService,
    automation_id: Any,
    data: dict,
) -> None:
    """Build the graph (nodes, edges, static_inputs) for a rich automation template."""

    # Resolve agent slugs to agent IDs
    agent_id_cache: dict[str, Any] = {}
    for node_def in data.get("nodes", []):
        agent_slug = node_def["agent_slug"]
        if agent_slug not in agent_id_cache:
            agent = await agent_service.get_agent_by_slug(agent_slug)
            if agent is None:
                logger.warning(
                    "Skipping automation node: agent '%s' not found", agent_slug,
                )
                continue
            agent_id_cache[agent_slug] = agent["id"]

    # Build node list for save_graph
    graph_nodes: list[dict] = []
    x_offset = 0
    for node_def in data.get("nodes", []):
        agent_slug = node_def["agent_slug"]
        agent_id = agent_id_cache.get(agent_slug)
        if agent_id is None:
            continue
        graph_nodes.append({
            "node_key": node_def["node_key"],
            "node_type": "agent",
            "agent_id": str(agent_id),
            "position": {"x": x_offset, "y": 0},
            "config": {},
        })
        x_offset += 300

    # Build sink nodes from sinks list
    for sink_def in data.get("sinks", []):
        sink_node_key = sink_def.get("node_key", f"sink_{sink_def['type']}")
        graph_nodes.append({
            "node_key": sink_node_key,
            "node_type": "sink",
            "sink_type": sink_def["type"],
            "position": {"x": x_offset, "y": 0},
            "config": sink_def.get("config", {}),
        })
        x_offset += 300

    # Build edges from wiring
    graph_edges: list[dict] = []
    for wire in data.get("wiring", []):
        from_parts = wire["from"].split(".")
        to_parts = wire["to"].split(".")
        if len(from_parts) >= 2 and len(to_parts) >= 2:
            graph_edges.append({
                "source_node_key": from_parts[0],
                "source_output_key": ".".join(from_parts[1:]),
                "target_node_key": to_parts[0],
                "target_input_key": ".".join(to_parts[1:]),
            })

    # Wire sinks to their source nodes
    for sink_def in data.get("sinks", []):
        wired_from = sink_def.get("wired_from", "")
        if not wired_from:
            continue
        from_parts = wired_from.split(".")
        if len(from_parts) >= 2:
            sink_node_key = sink_def.get("node_key", f"sink_{sink_def['type']}")
            graph_edges.append({
                "source_node_key": from_parts[0],
                "source_output_key": ".".join(from_parts[1:]),
                "target_node_key": sink_node_key,
                "target_input_key": "input",
            })

    # Build static inputs from node definitions
    graph_static_inputs: list[dict] = []
    for node_def in data.get("nodes", []):
        for input_key, value in (node_def.get("static_inputs") or {}).items():
            graph_static_inputs.append({
                "node_key": node_def["node_key"],
                "input_key": input_key,
                "static_value": value,
            })

    # Save the graph
    if graph_nodes:
        await automation_service.save_graph(
            automation_id,
            nodes=graph_nodes,
            edges=graph_edges,
            static_inputs=graph_static_inputs,
        )


async def seed_skill_templates(db: AsyncSession) -> None:
    """Seed built-in native skill templates from .md files in the skills/ directory.

    Skills are stored as knowledge items in the system so agents can
    discover and reference them.  Each skill has YAML frontmatter
    (name, slug, description, tags) and a markdown body.
    """
    skills_dir = _TEMPLATES_DIR / "skills"
    if not skills_dir.exists():
        return

    from openforge.db.models import SkillTemplateModel

    for md_file in sorted(skills_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            match = _FRONTMATTER_RE.match(content)
            if not match:
                continue

            fm_str, body = match.group(1), match.group(2)
            fm = yaml.safe_load(fm_str) or {}
            if not isinstance(fm, dict):
                continue

            slug = fm.get("slug", md_file.stem)

            existing = await db.scalar(
                select(SkillTemplateModel).where(SkillTemplateModel.slug == slug).limit(1)
            )
            if existing is not None:
                # Update if changed
                existing.name = fm.get("name", slug)
                existing.description = fm.get("description", "")
                existing.tags = fm.get("tags", [])
                existing.content = body.strip()
                await db.commit()
                logger.info("Updated skill template: %s", slug)
                continue

            skill = SkillTemplateModel(
                name=fm.get("name", slug),
                slug=slug,
                description=fm.get("description", ""),
                tags=fm.get("tags", []),
                content=body.strip(),
            )
            db.add(skill)
            await db.commit()
            logger.info("Seeded skill template: %s", slug)
        except Exception as exc:
            logger.warning("Failed to seed skill template %s: %s", md_file.name, exc)


# ── Curated sink definitions (from blueprint Part 4) ──
_CURATED_SINKS = [
    {
        "name": "Save to Knowledge",
        "slug": "knowledge-create",
        "description": "Saves automation output as a new knowledge item in the target workspace.",
        "sink_type": "knowledge_create",
        "icon": "book-open",
        "tags": ["knowledge", "storage"],
        "config": {
            "knowledge_type": "note",
            "title_template": "{{automation_name}} - {{date}}",
        },
    },
    {
        "name": "Send Notification",
        "slug": "notification",
        "description": "Sends a notification via configured channel (webhook, ntfy, Slack, or built-in).",
        "sink_type": "notification",
        "icon": "bell",
        "tags": ["notification", "alerts"],
        "config": {
            "channel": "default",
            "message_template": "{{value}}",
        },
    },
    {
        "name": "Publish Article",
        "slug": "article",
        "description": "Publishes automation output as a formatted article or document.",
        "sink_type": "article",
        "icon": "file-text",
        "tags": ["content", "publishing"],
        "config": {
            "format": "markdown",
        },
    },
    {
        "name": "Call REST API",
        "slug": "rest-api",
        "description": "Sends automation output to an external REST API endpoint.",
        "sink_type": "rest_api",
        "icon": "send",
        "tags": ["integration", "api"],
        "config": {
            "method": "POST",
            "headers": {"Content-Type": "application/json"},
            "body_template": "{{value}}",
        },
    },
    {
        "name": "Log Output",
        "slug": "log",
        "description": "Logs automation output for debugging and audit purposes. No external side effects.",
        "sink_type": "log",
        "icon": "terminal",
        "tags": ["debug", "logging"],
        "config": {},
    },
]


async def seed_sink_templates(db: AsyncSession) -> None:
    """Seed curated sink definitions so automations can reference them."""
    from openforge.db.models import SinkModel

    for sink_def in _CURATED_SINKS:
        try:
            slug = sink_def["slug"]
            existing = await db.scalar(
                select(SinkModel).where(SinkModel.slug == slug).limit(1)
            )
            if existing is not None:
                continue

            sink = SinkModel(
                name=sink_def["name"],
                slug=slug,
                description=sink_def.get("description", ""),
                sink_type=sink_def["sink_type"],
                config=sink_def.get("config", {}),
                icon=sink_def.get("icon"),
                tags_json=sink_def.get("tags", []),
            )
            db.add(sink)
            await db.flush()
            logger.info("Seeded sink: %s", slug)
        except Exception as exc:
            logger.warning("Failed to seed sink %s: %s", sink_def.get("slug"), exc)

    await db.commit()


# ── Recommended MCP server configurations ──
_RECOMMENDED_MCP_SERVERS = [
    {
        "name": "Brave Search",
        "url": "https://mcp.brave.com/sse",
        "description": "Brave Search API for web and news search. Requires a Brave Search API key.",
        "transport": "sse",
        "auth_type": "bearer",
        "is_enabled": False,
        "default_risk_level": "low",
        "tags": ["search", "research"],
        "agents": ["deep-researcher", "news-digest", "market-intelligence"],
    },
    {
        "name": "GitHub",
        "url": "https://api.githubcopilot.com/mcp/",
        "description": "GitHub integration for repository management, issues, and pull requests. Requires a GitHub personal access token.",
        "transport": "http",
        "auth_type": "bearer",
        "is_enabled": False,
        "default_risk_level": "medium",
        "tags": ["code", "github"],
        "agents": ["code-engineer"],
    },
]

_RETIRED_MCP_NAMES = [
    "Filesystem (Local)",
]


async def seed_mcp_recommendations(db: AsyncSession) -> None:
    """Seed recommended MCP server configurations (disabled by default).

    These serve as one-click-enable templates. Users still need to
    provide API keys and enable them before they become active.
    """
    from openforge.db.models import MCPServer

    # Remove retired MCP recommendations
    for name in _RETIRED_MCP_NAMES:
        existing = await db.scalar(
            select(MCPServer).where(MCPServer.name == name).limit(1)
        )
        if existing is not None:
            await db.delete(existing)
            logger.info("Removed retired MCP recommendation: %s", name)

    for mcp_def in _RECOMMENDED_MCP_SERVERS:
        try:
            name = mcp_def["name"]
            existing = await db.scalar(
                select(MCPServer).where(MCPServer.name == name).limit(1)
            )
            if existing is not None:
                continue

            server = MCPServer(
                name=name,
                url=mcp_def["url"],
                description=mcp_def.get("description"),
                transport=mcp_def.get("transport", "http"),
                auth_type=mcp_def.get("auth_type", "none"),
                is_enabled=mcp_def.get("is_enabled", False),
                default_risk_level=mcp_def.get("default_risk_level", "high"),
            )
            db.add(server)
            await db.flush()
            logger.info("Seeded MCP recommendation: %s (disabled)", name)
        except Exception as exc:
            logger.warning("Failed to seed MCP recommendation %s: %s", mcp_def.get("name"), exc)

    await db.commit()
