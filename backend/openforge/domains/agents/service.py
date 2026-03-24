"""Agent definition domain service."""

from __future__ import annotations

import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from openforge.db.models import AgentDefinitionModel, AgentDefinitionVersionModel
from openforge.domains.common.crud import CrudDomainService

logger = logging.getLogger("openforge.agents.service")


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[-\s]+", "-", text)


class AgentService(CrudDomainService):
    """Service for managing agent definitions and their versions."""

    model = AgentDefinitionModel

    # ── List / Get ────────────────────────────────────────────────────

    async def list_agents(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(AgentDefinitionModel).order_by(AgentDefinitionModel.updated_at.desc())
        count_query = select(func.count()).select_from(AgentDefinitionModel)

        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        agents = [self._serialize(row) for row in rows]
        return agents, int(total)

    async def get_agent(self, agent_id: UUID) -> dict[str, Any] | None:
        agent = await self.db.get(AgentDefinitionModel, agent_id)
        if agent is None:
            return None
        return self._serialize(agent)

    async def get_agent_by_slug(self, slug: str) -> dict[str, Any] | None:
        row = await self.db.scalar(
            select(AgentDefinitionModel).where(AgentDefinitionModel.slug == slug)
        )
        return self._serialize(row) if row else None

    # ── Create / Update / Delete ──────────────────────────────────────

    async def create_agent(self, data: dict[str, Any]) -> dict[str, Any]:
        # Serialize nested Pydantic models to dicts for JSONB storage
        payload = self._dump_pydantic_values(data)
        result = await self.create_record(payload)

        # Create initial version snapshot atomically
        agent = await self.db.get(AgentDefinitionModel, result["id"])
        if agent:
            version = await self._create_version(agent)
            agent.active_version_id = version.id
            await self.db.commit()
            await self.db.refresh(agent)
            result = self._serialize(agent)

        return result

    async def update_agent(self, agent_id: UUID, data: dict[str, Any]) -> dict[str, Any] | None:
        payload = self._dump_pydantic_values(data)
        result = await self.update_record(agent_id, payload)
        if result is None:
            return None

        # Create a new version snapshot after every update
        agent = await self.db.get(AgentDefinitionModel, agent_id)
        if agent:
            version = await self._create_version(agent)
            agent.active_version_id = version.id
            await self.db.commit()
            await self.db.refresh(agent)
            result = self._serialize(agent)

        return result

    async def delete_agent(self, agent_id: UUID) -> bool:
        return await self.delete_record(agent_id)

    # ── Versions ──────────────────────────────────────────────────────

    async def list_versions(
        self, agent_id: UUID, skip: int = 0, limit: int = 50
    ) -> tuple[list[dict[str, Any]], int]:
        query = (
            select(AgentDefinitionVersionModel)
            .where(AgentDefinitionVersionModel.agent_id == agent_id)
            .order_by(AgentDefinitionVersionModel.version.desc())
        )
        count_query = (
            select(func.count())
            .select_from(AgentDefinitionVersionModel)
            .where(AgentDefinitionVersionModel.agent_id == agent_id)
        )
        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

    async def get_version(
        self, agent_id: UUID, version_id: UUID
    ) -> dict[str, Any] | None:
        row = await self.db.scalar(
            select(AgentDefinitionVersionModel).where(
                AgentDefinitionVersionModel.agent_id == agent_id,
                AgentDefinitionVersionModel.id == version_id,
            )
        )
        return self._serialize(row) if row else None

    async def _create_version(self, agent: AgentDefinitionModel) -> AgentDefinitionVersionModel:
        """Create an immutable version snapshot of the current agent state."""
        # Determine next version number
        max_version = await self.db.scalar(
            select(func.max(AgentDefinitionVersionModel.version)).where(
                AgentDefinitionVersionModel.agent_id == agent.id
            )
        )
        next_version = (max_version or 0) + 1

        snapshot = {
            "name": agent.name,
            "slug": agent.slug,
            "description": agent.description,
            "icon": agent.icon,
            "tags": agent.tags or [],
            "system_prompt": agent.system_prompt,
            "llm_config": agent.llm_config or {},
            "tools_config": agent.tools_config or [],
            "memory_config": agent.memory_config or {},
            "parameters": agent.parameters or [],
            "output_definitions": agent.output_definitions or [],
        }

        version = AgentDefinitionVersionModel(
            agent_id=agent.id,
            version=next_version,
            snapshot=snapshot,
        )
        self.db.add(version)
        await self.db.flush()
        return version

    # ── Slug helpers ──────────────────────────────────────────────────

    async def _unique_slug(self, base_slug: str) -> str:
        candidate = base_slug
        suffix = 0
        while True:
            exists = await self.db.scalar(
                select(AgentDefinitionModel.id)
                .where(AgentDefinitionModel.slug == candidate)
                .limit(1)
            )
            if exists is None:
                return candidate
            suffix += 1
            candidate = f"{base_slug}-{suffix}"

    # ── Serialization ─────────────────────────────────────────────────

    @staticmethod
    def _dump_pydantic_values(data: dict[str, Any]) -> dict[str, Any]:
        """Convert any Pydantic model values in *data* to plain dicts."""
        out: dict[str, Any] = {}
        for key, val in data.items():
            if hasattr(val, "model_dump"):
                out[key] = val.model_dump()
            elif isinstance(val, list):
                out[key] = [
                    item.model_dump() if hasattr(item, "model_dump") else item
                    for item in val
                ]
            else:
                out[key] = val
        return out

    def _serialize(self, instance: Any) -> dict[str, Any]:
        data = super()._serialize(instance)
        if isinstance(instance, AgentDefinitionModel):
            data["tags"] = data.get("tags") or []
            # Derive input_schema and is_parameterized from parameters
            params = data.get("parameters") or []
            data["input_schema"] = params
            data["is_parameterized"] = len(params) > 0
        return data

    # ── System / Default agent seeding ────────────────────────────────

    async def ensure_default_agent(self, workspace_name: str) -> dict[str, Any]:
        """Create or return a default assistant agent for a workspace."""
        slug = f"{slugify(workspace_name)}-assistant"
        existing = await self.get_agent_by_slug(slug)
        if existing:
            return existing

        agent = await self.create_agent({
            "name": f"{workspace_name} Assistant",
            "slug": slug,
            "description": "Default assistant with knowledge access and tool use",
            "system_prompt": (
                f"You are the {workspace_name} Assistant. "
                "Help the user by searching workspace knowledge, browsing the web, "
                "and using available tools. Be concise and helpful."
            ),
            "llm_config": {"temperature": 0.7, "max_tokens": 2000, "allow_override": True},
            "memory_config": {
                "history_limit": 20,
                "attachment_support": True,
                "auto_bookmark_urls": True,
            },
            "tools_config": [],
            "parameters": [],
            "output_definitions": [{"key": "output", "type": "text"}],
        })
        return agent

    async def ensure_system_agents(self) -> None:
        """Seed system agents (router, council, optimizer) as real agent records."""
        _system_agents = [
            {
                "name": "Router Agent",
                "slug": "router_agent",
                "description": "Routes incoming messages to the best-fit agent",
                "system_prompt": (
                    "You are a router agent. Analyze the user's request "
                    "and delegate to the most appropriate agent."
                ),
                "llm_config": {"temperature": 0.7, "max_tokens": 2000, "allow_override": True},
                "tools_config": [],
            },
            {
                "name": "Council Agent",
                "slug": "council_agent",
                "description": "Multi-agent deliberation for complex decisions",
                "system_prompt": (
                    "You are a council agent. Gather input from multiple specialist "
                    "agents and synthesize a recommendation."
                ),
                "llm_config": {"temperature": 0.7, "max_tokens": 2000, "allow_override": True},
                "tools_config": [],
            },
            {
                "name": "Optimizer Agent",
                "slug": "optimizer_agent",
                "description": "Optimizes and refines prompts for better results",
                "system_prompt": (
                    "You are a prompt optimizer. Rewrite the user's prompt to be clearer, "
                    "more specific, and more effective. Return ONLY the optimized prompt."
                ),
                "llm_config": {"temperature": 0.7, "max_tokens": 2000, "allow_override": True},
                "tools_config": [],
            },
        ]
        for agent_def in _system_agents:
            existing = await self.get_agent_by_slug(agent_def["slug"])
            if existing is not None:
                continue
            try:
                await self.create_agent(agent_def)
                logger.info("Seeded system agent: %s", agent_def["slug"])
            except Exception as exc:
                logger.warning("Failed to seed system agent %s: %s", agent_def["slug"], exc)
