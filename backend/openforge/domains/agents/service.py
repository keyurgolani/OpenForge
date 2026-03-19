"""Agent domain service."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from openforge.db.models import AgentModel, CompiledAgentSpecModel
from openforge.domains.common.crud import CrudDomainService

from .blueprint import (
    AgentBlueprint,
    parse_agent_md,
    render_default_agent_md,
    slugify,
)
from .compiler import AgentBlueprintCompiler

logger = logging.getLogger("openforge.agents.service")


class AgentService(CrudDomainService):
    """Service for managing agents and triggering compilation."""

    model = AgentModel

    async def list_agents(
        self,
        skip: int = 0,
        limit: int = 100,
        status: str | None = None,
        mode: str | None = None,
        is_template: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(AgentModel).order_by(AgentModel.updated_at.desc())
        count_query = select(func.count()).select_from(AgentModel)

        if status is not None:
            query = query.where(AgentModel.status == status)
            count_query = count_query.where(AgentModel.status == status)
        if mode is not None:
            query = query.where(AgentModel.mode == mode)
            count_query = count_query.where(AgentModel.mode == mode)
        if is_template is not None:
            query = query.where(AgentModel.is_template == is_template)
            count_query = count_query.where(AgentModel.is_template == is_template)

        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

    async def get_agent(self, agent_id: UUID) -> dict[str, Any] | None:
        return await self.get_record(agent_id)

    async def get_agent_by_slug(self, slug: str) -> dict[str, Any] | None:
        row = await self.db.scalar(select(AgentModel).where(AgentModel.slug == slug))
        return self._serialize(row) if row else None

    async def create_agent(self, data: dict[str, Any]) -> dict[str, Any]:
        blueprint_md = data.get("blueprint_md")
        result = await self.create_record(data)

        # Auto-compile if blueprint_md is provided
        if blueprint_md:
            try:
                agent = await self.db.get(AgentModel, result["id"])
                blueprint, md_hash = parse_agent_md(blueprint_md)
                compiler = AgentBlueprintCompiler(self.db)
                await compiler.compile(agent, blueprint, md_hash)
                await self.db.refresh(agent)
                result = self._serialize(agent)
            except Exception as e:
                logger.warning("Auto-compilation failed for agent %s: %s", result.get("slug"), e)

        return result

    async def update_agent(self, agent_id: UUID, data: dict[str, Any]) -> dict[str, Any] | None:
        result = await self.update_record(agent_id, data)
        if result is None:
            return None

        # Auto-recompile if blueprint_md changed
        if "blueprint_md" in data and data["blueprint_md"]:
            try:
                agent = await self.db.get(AgentModel, agent_id)
                blueprint, md_hash = parse_agent_md(data["blueprint_md"])
                compiler = AgentBlueprintCompiler(self.db)
                await compiler.compile(agent, blueprint, md_hash)
                await self.db.refresh(agent)
                result = self._serialize(agent)
            except Exception as e:
                logger.warning("Auto-recompilation failed for agent %s: %s", agent_id, e)

        return result

    async def delete_agent(self, agent_id: UUID) -> bool:
        return await self.delete_record(agent_id)

    async def compile_agent(self, agent_id: UUID) -> dict[str, Any] | None:
        """Force recompilation of an agent's blueprint."""
        agent = await self.db.get(AgentModel, agent_id)
        if agent is None:
            return None

        if not agent.blueprint_md:
            return {
                "agent_id": agent.id,
                "compilation_status": "failed",
                "compilation_error": "No blueprint_md set",
            }

        blueprint, md_hash = parse_agent_md(agent.blueprint_md)
        compiler = AgentBlueprintCompiler(self.db)
        await compiler.compile(agent, blueprint, md_hash)
        await self.db.refresh(agent)

        return {
            "agent_id": agent.id,
            "spec_id": agent.active_spec_id,
            "version": await self._latest_version(agent.id),
            "compilation_status": agent.compilation_status,
            "compilation_error": agent.compilation_error,
        }

    async def get_active_spec(self, agent_id: UUID) -> dict[str, Any] | None:
        """Get the active compiled spec for an agent."""
        agent = await self.db.get(AgentModel, agent_id)
        if agent is None or agent.active_spec_id is None:
            return None
        spec = await self.db.get(CompiledAgentSpecModel, agent.active_spec_id)
        if spec is None:
            return None
        return self._serialize(spec)

    async def list_specs(self, agent_id: UUID, skip: int = 0, limit: int = 50) -> tuple[list[dict], int]:
        """List all compiled spec versions for an agent."""
        query = (
            select(CompiledAgentSpecModel)
            .where(CompiledAgentSpecModel.agent_id == agent_id)
            .order_by(CompiledAgentSpecModel.version.desc())
        )
        count_query = (
            select(func.count())
            .select_from(CompiledAgentSpecModel)
            .where(CompiledAgentSpecModel.agent_id == agent_id)
        )
        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

    async def list_templates(
        self, skip: int = 0, limit: int = 100
    ) -> tuple[list[dict[str, Any]], int]:
        return await self.list_agents(skip=skip, limit=limit, is_template=True)

    async def get_template(self, agent_id: UUID) -> dict[str, Any] | None:
        agent = await self.get_agent(agent_id)
        if agent is None or not agent.get("is_template"):
            return None
        return agent

    async def _unique_slug(self, base_slug: str) -> str:
        candidate = base_slug
        suffix = 0
        while True:
            exists = await self.db.scalar(
                select(AgentModel.id).where(AgentModel.slug == candidate).limit(1)
            )
            if exists is None:
                return candidate
            suffix += 1
            candidate = f"{base_slug}-{suffix}"

    async def clone_template(self, agent_id: UUID, clone_data: dict[str, Any]) -> dict[str, Any] | None:
        template = await self.get_template(agent_id)
        if template is None:
            return None

        desired_slug = clone_data.get("slug") or f"{template['slug']}-clone"
        unique_slug = await self._unique_slug(desired_slug)

        clone_payload = {
            "name": clone_data.get("name") or template["name"],
            "slug": unique_slug,
            "description": template.get("description"),
            "blueprint_md": template.get("blueprint_md", ""),
            "mode": template.get("mode", "interactive"),
            "status": "draft",
            "is_system": False,
            "is_template": False,
            "icon": template.get("icon"),
            "tags": list(template.get("tags") or []),
        }
        return await self.create_agent(clone_payload)

    async def ensure_default_agent(self, workspace_name: str) -> dict[str, Any]:
        """Create or return a default assistant agent for a workspace."""
        slug = f"{slugify(workspace_name)}-assistant"
        existing = await self.get_agent_by_slug(slug)
        if existing:
            return existing

        default_blueprint = render_default_agent_md(workspace_name)
        agent = await self.create_agent({
            "name": f"{workspace_name} Assistant",
            "slug": slug,
            "description": "Default assistant with knowledge access and tool use",
            "blueprint_md": default_blueprint,
            "mode": "interactive",
            "status": "active",
            "is_system": True,
        })
        return agent

    async def ensure_system_agents(self) -> None:
        """Seed system agents (router, council, optimizer) as real AgentModel records."""
        _system_agents = [
            {
                "name": "Router Agent",
                "slug": "router_agent",
                "description": "Routes incoming messages to the best-fit agent",
                "mode": "interactive",
                "blueprint_md": "---\nname: Router Agent\nstrategy: chat\ntools:\n  enabled: true\n---\nYou are a router agent. Analyze the user's request and delegate to the most appropriate agent.",
            },
            {
                "name": "Council Agent",
                "slug": "council_agent",
                "description": "Multi-agent deliberation for complex decisions",
                "mode": "interactive",
                "blueprint_md": "---\nname: Council Agent\nstrategy: chat\ntools:\n  enabled: true\n---\nYou are a council agent. Gather input from multiple specialist agents and synthesize a recommendation.",
            },
            {
                "name": "Optimizer Agent",
                "slug": "optimizer_agent",
                "description": "Optimizes and refines prompts for better results",
                "mode": "interactive",
                "blueprint_md": "---\nname: Optimizer Agent\nstrategy: chat\ntools:\n  enabled: false\n---\nYou are a prompt optimizer. Rewrite the user's prompt to be clearer, more specific, and more effective. Return ONLY the optimized prompt.",
            },
        ]
        for agent_def in _system_agents:
            existing = await self.get_agent_by_slug(agent_def["slug"])
            if existing is not None:
                continue
            try:
                await self.create_agent({
                    **agent_def,
                    "status": "active",
                    "is_system": True,
                })
                logger.info("Seeded system agent: %s", agent_def["slug"])
            except Exception as exc:
                logger.warning("Failed to seed system agent %s: %s", agent_def["slug"], exc)

    async def _latest_version(self, agent_id: UUID) -> int:
        result = await self.db.scalar(
            select(func.max(CompiledAgentSpecModel.version))
            .where(CompiledAgentSpecModel.agent_id == agent_id)
        )
        return result or 0

    def _serialize(self, instance: Any) -> dict[str, Any]:
        data = super()._serialize(instance)
        if isinstance(instance, AgentModel):
            data["tags"] = data.get("tags") or []
        return data
