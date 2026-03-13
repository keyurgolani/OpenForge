"""Agent registry — manages agent definitions at runtime."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.agent_definition import AgentDefinition
from openforge.db.models import AgentDefinitionModel, Workspace

logger = logging.getLogger("openforge.agent_registry")

# The system workspace agent definition (same prompt mechanism as current engine)
WORKSPACE_AGENT = AgentDefinition(
    id="workspace_agent",
    name="Workspace Assistant",
    description="General-purpose AI assistant with workspace knowledge and tool access.",
    version="0.1.0",
    system_prompt="catalogue:agent_system",
    execution_mode="streaming",
    max_iterations=20,
    tools_enabled=True,
    allowed_tool_categories=None,
    blocked_tool_ids=[],
    skill_ids=[],
    knowledge_scope="workspace",
    rag_enabled=True,
    rag_limit=5,
    rag_score_threshold=0.35,
    history_limit=20,
    attachment_support=True,
    auto_bookmark_urls=True,
    mention_support=True,
    provider_override_id=None,
    model_override=None,
    allow_runtime_model_override=True,
    is_system=True,
    is_default=True,
    icon=None,
)


ROUTER_AGENT = AgentDefinition(
    id="router_agent",
    name="Request Router",
    description="Examines incoming requests and delegates to the most appropriate specialized agent.",
    version="0.1.0",
    system_prompt="catalogue:router_system",
    execution_mode="streaming",
    max_iterations=5,
    tools_enabled=True,
    allowed_tool_categories=["agent"],
    is_system=True,
)

COUNCIL_AGENT = AgentDefinition(
    id="council_agent",
    name="Response Council",
    description="Spawns multiple agents for the same request, evaluates responses, selects the best.",
    version="0.1.0",
    system_prompt="catalogue:council_system",
    execution_mode="streaming",
    max_iterations=15,
    tools_enabled=True,
    allowed_tool_categories=["agent"],
    is_system=True,
)

OPTIMIZER_AGENT = AgentDefinition(
    id="optimizer_agent",
    name="Prompt Optimizer",
    description="Rewrites prompts to be more specific, well-structured, and effective.",
    version="0.1.0",
    system_prompt="catalogue:optimizer_system",
    execution_mode="streaming",
    max_iterations=3,
    tools_enabled=False,
    rag_enabled=False,
    is_system=True,
)


class AgentRegistry:
    """Manages agent definitions. System agents registered at startup; custom from DB."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentDefinition] = {}

    def register_system_agent(self, agent: AgentDefinition) -> None:
        self._agents[agent.id] = agent
        logger.info("Registered system agent: %s", agent.id)

    async def load_custom_agents(self, db: AsyncSession) -> None:
        """Load custom (non-system) agents from the database."""
        result = await db.execute(
            select(AgentDefinitionModel).where(AgentDefinitionModel.is_system == False)
        )
        for row in result.scalars().all():
            agent = AgentDefinition.from_db_row(row)
            self._agents[agent.id] = agent
        logger.info("Loaded %d custom agents from DB", len(self._agents) - 1)

    async def upsert_to_db(self, db: AsyncSession, agent: AgentDefinition) -> None:
        """Persist an agent definition to the database."""
        result = await db.execute(
            select(AgentDefinitionModel).where(AgentDefinitionModel.id == agent.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.name = agent.name
            existing.description = agent.description
            existing.version = agent.version
            existing.config = agent.to_config_dict()
            existing.is_system = agent.is_system
            existing.is_default = agent.is_default
            existing.icon = agent.icon
        else:
            db.add(AgentDefinitionModel(
                id=agent.id,
                name=agent.name,
                description=agent.description,
                version=agent.version,
                config=agent.to_config_dict(),
                is_system=agent.is_system,
                is_default=agent.is_default,
                icon=agent.icon,
            ))
        await db.commit()

    def get(self, agent_id: str) -> AgentDefinition | None:
        return self._agents.get(agent_id)

    def get_default(self) -> AgentDefinition:
        for agent in self._agents.values():
            if agent.is_default:
                return agent
        return WORKSPACE_AGENT

    async def get_for_workspace(self, db: AsyncSession, workspace_id: UUID) -> AgentDefinition:
        """Get the agent for a workspace with workspace-level overrides applied."""
        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = ws_result.scalar_one_or_none()
        if not workspace:
            return self.get_default()

        agent_id = workspace.agent_id or "workspace_agent"
        agent = self.get(agent_id)
        if not agent:
            agent = self.get_default()

        return agent.merge_workspace_overrides(
            agent_enabled=workspace.agent_enabled,
            agent_tool_categories=list(workspace.agent_tool_categories or []),
            agent_max_tool_loops=workspace.agent_max_tool_loops,
        )

    def list_all(self) -> list[AgentDefinition]:
        return list(self._agents.values())


# Singleton
agent_registry = AgentRegistry()
