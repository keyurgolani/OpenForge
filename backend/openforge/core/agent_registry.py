"""Agent Registry for OpenForge v2.5 Agent Framework."""
import logging
from typing import Optional
from uuid import UUID

from openforge.core.agent_definition import AgentDefinition, WORKSPACE_AGENT

logger = logging.getLogger("openforge.agent_registry")


class AgentRegistry:
    """Registry for all agent definitions (system and custom)."""

    def __init__(self):
        self._agents: dict[str, AgentDefinition] = {}

    def register_system_agent(self, agent: AgentDefinition):
        """Register a system agent definition."""
        self._agents[agent.agent_id] = agent
        logger.info(f"Registered system agent: {agent.agent_id}")

    async def load_custom_agents(self, db):
        """Load custom agents from database."""
        try:
            from sqlalchemy import select
            from openforge.db.models import AgentDefinition as AgentDefinitionModel

            result = await db.execute(select(AgentDefinitionModel))
            models = result.scalars().all()
            for model in models:
                agent = AgentDefinition.from_db_model(model)
                self._agents[agent.agent_id] = agent
                logger.info(f"Loaded custom agent from DB: {agent.agent_id}")
        except Exception as e:
            logger.warning(f"Could not load custom agents from DB: {e}")

    def get(self, agent_id: str) -> Optional[AgentDefinition]:
        """Get agent by ID."""
        return self._agents.get(agent_id)

    def get_default(self) -> AgentDefinition:
        """Get the default agent."""
        for agent in self._agents.values():
            if agent.is_default:
                return agent
        # Fallback to workspace_agent
        return self._agents.get("workspace_agent", WORKSPACE_AGENT)

    async def get_for_workspace(self, db, workspace_id: UUID) -> AgentDefinition:
        """Get the agent configured for a workspace."""
        try:
            from sqlalchemy import select
            from openforge.db.models import Workspace

            result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
            workspace = result.scalar_one_or_none()

            if workspace and hasattr(workspace, 'agent_id') and workspace.agent_id:
                agent = self.get(workspace.agent_id)
                if agent:
                    return agent
        except Exception as e:
            logger.warning(f"Could not get workspace agent: {e}")

        return self.get_default()

    def list_all(self) -> list[AgentDefinition]:
        """List all registered agents."""
        return list(self._agents.values())


# Global registry instance
agent_registry = AgentRegistry()
# Register the default workspace agent
agent_registry.register_system_agent(WORKSPACE_AGENT)
