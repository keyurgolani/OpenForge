"""Transitional runtime-owned agent definitions and registry.

This module keeps the pre-Profile chat runtime operable without reintroducing
the deleted legacy package surface from Phase 2. It is an internal runtime
seam scheduled to disappear once Profiles fully own agent configuration.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import AgentDefinitionModel, Workspace

logger = logging.getLogger("openforge.runtime.transitional_agents")


@dataclass
class AgentDefinition:
    id: str
    name: str
    description: str
    version: str = "0.1.0"

    system_prompt: str = ""
    execution_mode: str = "streaming"
    max_iterations: int = 20
    tools_enabled: bool = True
    allowed_tool_categories: list[str] | None = None
    blocked_tool_ids: list[str] = field(default_factory=list)
    tool_overrides: dict[str, str] = field(default_factory=dict)
    max_tool_calls_per_minute: int = 30
    max_tool_calls_per_execution: int = 200

    skill_ids: list[str] = field(default_factory=list)

    knowledge_scope: str = "workspace"
    rag_enabled: bool = True
    rag_limit: int = 5
    rag_score_threshold: float = 0.35

    history_limit: int = 20
    attachment_support: bool = True
    auto_bookmark_urls: bool = True
    mention_support: bool = True

    provider_override_id: str | None = None
    model_override: str | None = None
    allow_runtime_model_override: bool = True

    is_system: bool = False
    is_default: bool = False
    icon: str | None = None

    def to_config_dict(self) -> dict:
        return {
            "system_prompt": self.system_prompt,
            "execution_mode": self.execution_mode,
            "max_iterations": self.max_iterations,
            "tools_enabled": self.tools_enabled,
            "allowed_tool_categories": self.allowed_tool_categories,
            "blocked_tool_ids": self.blocked_tool_ids,
            "tool_overrides": self.tool_overrides,
            "max_tool_calls_per_minute": self.max_tool_calls_per_minute,
            "max_tool_calls_per_execution": self.max_tool_calls_per_execution,
            "skill_ids": self.skill_ids,
            "knowledge_scope": self.knowledge_scope,
            "rag_enabled": self.rag_enabled,
            "rag_limit": self.rag_limit,
            "rag_score_threshold": self.rag_score_threshold,
            "history_limit": self.history_limit,
            "attachment_support": self.attachment_support,
            "auto_bookmark_urls": self.auto_bookmark_urls,
            "mention_support": self.mention_support,
            "provider_override_id": self.provider_override_id,
            "model_override": self.model_override,
            "allow_runtime_model_override": self.allow_runtime_model_override,
        }

    @classmethod
    def from_db_row(cls, row: AgentDefinitionModel) -> "AgentDefinition":
        config = row.config or {}
        return cls(
            id=row.id,
            name=row.name,
            description=row.description or "",
            version=row.version,
            is_system=row.is_system,
            is_default=row.is_default,
            icon=row.icon,
            **{key: value for key, value in config.items() if key in cls.__dataclass_fields__},
        )

    def merge_workspace_overrides(
        self,
        *,
        agent_enabled: bool = True,
        agent_tool_categories: list[str] | None = None,
        agent_max_tool_loops: int | None = None,
    ) -> "AgentDefinition":
        # The runtime still reads workspace settings for continuity, but the
        # agent definition remains the primary owner of capability config.
        return AgentDefinition(
            **{
                **self.__dict__,
                "tools_enabled": self.tools_enabled if agent_enabled else False,
                "allowed_tool_categories": (
                    list(agent_tool_categories)
                    if agent_tool_categories
                    else self.allowed_tool_categories
                ),
                "max_iterations": agent_max_tool_loops or self.max_iterations,
            }
        )


WORKSPACE_AGENT = AgentDefinition(
    id="workspace_agent",
    name="Workspace Assistant",
    description="General-purpose AI assistant with workspace knowledge and tool access.",
    system_prompt="catalogue:agent_system",
    execution_mode="streaming",
    max_iterations=20,
    tools_enabled=True,
    allowed_tool_categories=None,
    is_system=True,
    is_default=True,
)

ROUTER_AGENT = AgentDefinition(
    id="router_agent",
    name="Request Router",
    description="Examines incoming requests and delegates to the most appropriate specialized agent.",
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
    system_prompt="catalogue:optimizer_system",
    execution_mode="streaming",
    max_iterations=3,
    tools_enabled=False,
    rag_enabled=False,
    is_system=True,
)

SYSTEM_AGENTS = [
    WORKSPACE_AGENT,
    ROUTER_AGENT,
    COUNCIL_AGENT,
    OPTIMIZER_AGENT,
]


class AgentRegistry:
    """Runtime-local registry for transitional agent definitions."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentDefinition] = {}

    def register_system_agent(self, agent: AgentDefinition) -> None:
        self._agents[agent.id] = agent

    def register_system_agents(self) -> None:
        for agent in SYSTEM_AGENTS:
            self.register_system_agent(agent)

    async def load_custom_agents(self, db: AsyncSession) -> None:
        result = await db.execute(
            select(AgentDefinitionModel).where(AgentDefinitionModel.is_system == False)
        )
        for row in result.scalars().all():
            self._agents[row.id] = AgentDefinition.from_db_row(row)

    async def upsert_to_db(self, db: AsyncSession, agent: AgentDefinition) -> None:
        result = await db.execute(
            select(AgentDefinitionModel).where(AgentDefinitionModel.id == agent.id)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(
                AgentDefinitionModel(
                    id=agent.id,
                    name=agent.name,
                    description=agent.description,
                    version=agent.version,
                    config=agent.to_config_dict(),
                    is_system=agent.is_system,
                    is_default=agent.is_default,
                    icon=agent.icon,
                )
            )
        else:
            existing.name = agent.name
            existing.description = agent.description
            existing.version = agent.version
            existing.config = agent.to_config_dict()
            existing.is_system = agent.is_system
            existing.is_default = agent.is_default
            existing.icon = agent.icon
        await db.commit()

    def get(self, agent_id: str) -> AgentDefinition | None:
        return self._agents.get(agent_id)

    def get_default(self) -> AgentDefinition:
        return next((agent for agent in self._agents.values() if agent.is_default), WORKSPACE_AGENT)

    async def get_for_workspace(self, db: AsyncSession, workspace_id: UUID) -> AgentDefinition:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()
        if workspace is None:
            return self.get_default()

        agent = self.get(workspace.agent_id or WORKSPACE_AGENT.id) or self.get_default()
        return agent.merge_workspace_overrides(
            agent_enabled=workspace.agent_enabled,
            agent_tool_categories=list(workspace.agent_tool_categories or []),
            agent_max_tool_loops=workspace.agent_max_tool_loops,
        )

    def list_all(self) -> list[AgentDefinition]:
        return list(self._agents.values())


agent_registry = AgentRegistry()

