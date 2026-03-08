"""Agent Definition for OpenForge v2.5 Agent Framework."""
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID


@dataclass
class AgentDefinition:
    """Defines an agent's capabilities and behavior."""
    agent_id: str
    name: str
    description: str
    system_prompt: str

    # Tool settings
    tools_enabled: bool = True
    allowed_tool_categories: list[str] = field(default_factory=lambda: ["filesystem", "git", "http", "shell", "language", "memory", "task", "skills"])
    allowed_tool_ids: list[str] = field(default_factory=list)

    # RAG settings
    rag_enabled: bool = True
    rag_limit: int = 5
    rag_score_threshold: float = 0.3

    # Conversation settings
    history_limit: int = 20
    max_iterations: int = 10

    # Feature flags
    attachment_support: bool = True
    auto_bookmark_urls: bool = True
    skill_hints: list[str] = field(default_factory=list)

    # Registry metadata
    is_default: bool = False
    is_system: bool = True

    @classmethod
    def from_db_model(cls, model) -> "AgentDefinition":
        """Convert DB model to AgentDefinition."""
        return cls(
            agent_id=model.agent_id,
            name=model.name,
            description=model.description or "",
            system_prompt=model.system_prompt,
            tools_enabled=model.tools_enabled,
            allowed_tool_categories=model.allowed_tool_categories or [],
            allowed_tool_ids=model.allowed_tool_ids or [],
            rag_enabled=model.rag_enabled,
            rag_limit=model.rag_limit,
            rag_score_threshold=model.rag_score_threshold,
            history_limit=model.history_limit,
            max_iterations=model.max_iterations,
            attachment_support=model.attachment_support,
            auto_bookmark_urls=model.auto_bookmark_urls,
            skill_hints=model.skill_hints or [],
            is_default=model.is_default,
            is_system=model.is_system,
        )


# The default workspace agent definition
WORKSPACE_AGENT = AgentDefinition(
    agent_id="workspace_agent",
    name="Workspace Assistant",
    description="A general-purpose AI assistant with access to workspace tools, knowledge search, and file operations.",
    system_prompt="""You are a helpful AI assistant integrated into a workspace environment.

You have access to a workspace knowledge base containing documents, notes, and bookmarks. Relevant knowledge is automatically retrieved and included in your context when available.

When tools are available, use them to complete tasks. Think step by step: determine what information or actions are needed, use the appropriate tools, then synthesize a clear answer.

Be concise, helpful, and accurate. Use markdown formatting for code blocks, lists, and structured content.""",
    tools_enabled=True,
    rag_enabled=True,
    rag_limit=5,
    rag_score_threshold=0.3,
    history_limit=20,
    max_iterations=10,
    attachment_support=True,
    auto_bookmark_urls=True,
    is_default=True,
    is_system=True,
)
