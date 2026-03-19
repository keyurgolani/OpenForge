"""Agent registry — resolves AgentModel → CompiledAgentSpec for runtime use."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import AgentModel, CompiledAgentSpecModel, Workspace
from openforge.domains.agents.compiled_spec import CompiledAgentSpec

logger = logging.getLogger("openforge.runtime.agent_registry")


class AgentRegistry:
    """Resolves agents to their compiled specifications with caching."""

    def __init__(self) -> None:
        self._cache: dict[UUID, CompiledAgentSpec] = {}
        self._slug_cache: dict[str, UUID] = {}

    async def resolve(
        self,
        db: AsyncSession,
        *,
        agent_id: UUID | None = None,
        slug: str | None = None,
    ) -> CompiledAgentSpec | None:
        """Resolve an agent to its compiled spec by ID or slug."""
        # Check cache
        if agent_id and agent_id in self._cache:
            return self._cache[agent_id]
        if slug and slug in self._slug_cache:
            cached_id = self._slug_cache[slug]
            if cached_id in self._cache:
                return self._cache[cached_id]

        # Query agent
        if agent_id:
            agent = await db.get(AgentModel, agent_id)
        elif slug:
            result = await db.execute(
                select(AgentModel).where(AgentModel.slug == slug).limit(1)
            )
            agent = result.scalar_one_or_none()
        else:
            return None

        if agent is None:
            return None

        if agent.active_spec_id is None:
            logger.debug("Agent %s has no active spec", agent.id)
            return None

        # Load compiled spec
        spec_model = await db.get(CompiledAgentSpecModel, agent.active_spec_id)
        if spec_model is None:
            logger.warning("CompiledAgentSpecModel %s not found for agent %s", agent.active_spec_id, agent.id)
            return None

        resolved_config = spec_model.resolved_config
        if not resolved_config:
            return None

        try:
            spec = CompiledAgentSpec(**resolved_config)
        except Exception as exc:
            logger.warning("Failed to deserialize CompiledAgentSpec for agent %s: %s", agent.id, exc)
            return None

        # Cache
        self._cache[agent.id] = spec
        self._slug_cache[agent.slug] = agent.id
        return spec

    async def resolve_for_workspace(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> CompiledAgentSpec | None:
        """Resolve the default agent for a workspace via Workspace.default_agent_id."""
        workspace = await db.get(Workspace, workspace_id)
        if workspace is None:
            return None

        if workspace.default_agent_id is None:
            return None

        return await self.resolve(db, agent_id=workspace.default_agent_id)

    async def list_available_agents(self, db: AsyncSession) -> list[dict[str, Any]]:
        """List all active agents with compiled specs."""
        result = await db.execute(
            select(AgentModel).where(
                AgentModel.status == "active",
                AgentModel.active_spec_id.isnot(None),
            )
        )
        agents = result.scalars().all()
        return [
            {
                "id": str(agent.id),
                "slug": agent.slug,
                "name": agent.name,
                "description": agent.description,
                "mode": agent.mode,
                "icon": agent.icon,
            }
            for agent in agents
        ]

    def invalidate(self, agent_id: UUID) -> None:
        """Remove a cached agent spec."""
        self._cache.pop(agent_id, None)
        # Also clean slug cache
        to_remove = [slug for slug, aid in self._slug_cache.items() if aid == agent_id]
        for slug in to_remove:
            self._slug_cache.pop(slug, None)

    def clear_cache(self) -> None:
        """Clear all caches."""
        self._cache.clear()
        self._slug_cache.clear()


agent_registry = AgentRegistry()
