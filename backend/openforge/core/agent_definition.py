"""Agent definition dataclass — the configuration contract for all agents."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AgentDefinition:
    id: str
    name: str
    description: str
    version: str = "0.1.0"

    # Behavior
    system_prompt: str = ""
    execution_mode: str = "streaming"  # "streaming" or "background"
    max_iterations: int = 20
    tools_enabled: bool = True
    allowed_tool_categories: list[str] | None = None  # None = all
    blocked_tool_ids: list[str] = field(default_factory=list)
    tool_overrides: dict[str, str] = field(default_factory=dict)  # tool_id → "allowed"|"hitl"|"blocked"
    max_tool_calls_per_minute: int = 30
    max_tool_calls_per_execution: int = 200

    # Skills
    skill_ids: list[str] = field(default_factory=list)

    # Knowledge
    knowledge_scope: str = "workspace"
    # Deprecated: auto-RAG replaced by agentic retrieval via workspace__search tool.
    # Kept for backward compatibility with existing DB configs.
    rag_enabled: bool = True
    rag_limit: int = 5
    rag_score_threshold: float = 0.35

    # Context
    history_limit: int = 20
    attachment_support: bool = True
    auto_bookmark_urls: bool = True
    mention_support: bool = True

    # Provider
    provider_override_id: str | None = None
    model_override: str | None = None
    allow_runtime_model_override: bool = True

    # Metadata
    is_system: bool = False
    is_default: bool = False
    icon: str | None = None

    def to_config_dict(self) -> dict:
        """Serialize the behavioral config fields to a JSONB-storable dict."""
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
    def from_db_row(cls, row) -> AgentDefinition:
        """Reconstruct from an AgentDefinitionModel row."""
        cfg = row.config or {}
        return cls(
            id=row.id,
            name=row.name,
            description=row.description or "",
            version=row.version,
            is_system=row.is_system,
            is_default=row.is_default,
            icon=row.icon,
            **{k: v for k, v in cfg.items() if k in cls.__dataclass_fields__},
        )

    def merge_workspace_overrides(
        self,
        *,
        agent_enabled: bool = True,
        agent_tool_categories: list[str] | None = None,
        agent_max_tool_loops: int | None = None,
    ) -> AgentDefinition:
        """Return a copy with workspace-level overrides applied.

        Agent mode is always on and tool categories are controlled by the
        agent definition's own config, so workspace-level overrides are
        no longer applied.  The method is kept for backward compatibility
        with callers that still pass these kwargs.
        """
        return self
