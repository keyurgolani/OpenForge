import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Text, Boolean, Integer, Float, DateTime, ForeignKey,
    Index, CheckConstraint, LargeBinary, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped, relationship
from typing import Optional, List, Dict, Any

from openforge.db.base import Base

def now_utc():
    return datetime.now(timezone.utc)


class Config(Base):
    __tablename__ = "config"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider_name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    api_key_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    endpoint_id: Mapped[str] = mapped_column(String(50), nullable=False, default="default")
    base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    default_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    enabled_models: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    is_system_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    workspaces: Mapped[list["Workspace"]] = relationship(
        back_populates="llm_provider",
        foreign_keys="[Workspace.llm_provider_id]",
    )

    __table_args__ = (
        Index(
            "idx_llm_providers_system_default",
            "is_system_default",
            unique=True,
            postgresql_where="is_system_default = TRUE",
        ),
    )


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    llm_provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True
    )
    llm_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    knowledge_intelligence_provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True
    )
    knowledge_intelligence_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    vision_provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True
    )
    vision_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    agent_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, default="workspace_agent"
    )
    agent_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    agent_tool_categories: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)
    agent_max_tool_loops: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    llm_provider: Mapped[Optional["LLMProvider"]] = relationship(
        back_populates="workspaces", foreign_keys="[Workspace.llm_provider_id]"
    )
    knowledge: Mapped[list["Knowledge"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")


class Knowledge(Base):
    __tablename__ = "knowledge"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="note")
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    url_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    url_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gist_language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    insights: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ai_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    embedding_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="knowledge")
    tags: Mapped[list["KnowledgeTag"]] = relationship(back_populates="knowledge", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_knowledge_workspace", "workspace_id"),
        Index("idx_knowledge_type", "workspace_id", "type"),
        Index("idx_knowledge_updated", "workspace_id", "updated_at"),
        Index("idx_knowledge_archived", "workspace_id", "is_archived"),
    )


class KnowledgeTag(Base):
    __tablename__ = "knowledge_tags"

    knowledge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge.id", ondelete="CASCADE"), primary_key=True
    )
    tag: Mapped[str] = mapped_column(String(100), primary_key=True)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="ai")

    knowledge: Mapped["Knowledge"] = relationship(back_populates="tags")

    __table_args__ = (
        Index("idx_knowledge_tags_tag", "tag"),
        Index("idx_knowledge_tags_knowledge", "knowledge_id"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    title_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_subagent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    subagent_agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_conversations_workspace", "workspace_id", "updated_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    thinking: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_used: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    provider_used: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    generation_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    context_sources: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    tool_calls: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    timeline: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    provider_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_interrupted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    attachments: Mapped[List["MessageAttachment"]] = relationship(back_populates="message", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_messages_conversation", "conversation_id", "created_at"),
    )


class MessageAttachment(Base):
    """File attachments for chat messages (PDFs, images, text files)."""
    __tablename__ = "message_attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    message: Mapped[Optional["Message"]] = relationship(back_populates="attachments")

    __table_args__ = (
        Index("idx_message_attachments_message", "message_id"),
    )


class Onboarding(Base):
    __tablename__ = "onboarding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    current_step: Mapped[str] = mapped_column(String(50), nullable=False, default="welcome")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("id = 1", name="onboarding_singleton"),
    )


class ToolCallLog(Base):
    """Audit log for individual agent tool call executions."""
    __tablename__ = "tool_call_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    call_id: Mapped[str] = mapped_column(String(255), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    arguments: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    success: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_tool_call_logs_conv", "conversation_id", "started_at"),
        Index("idx_tool_call_logs_ws", "workspace_id", "started_at"),
        Index("idx_tool_call_logs_name", "tool_name", "started_at"),
    )


class MCPServer(Base):
    """External MCP server configuration."""
    __tablename__ = "mcp_servers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transport: Mapped[str] = mapped_column(String(10), nullable=False, default="http")
    auth_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    auth_value_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    discovered_tools: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, nullable=True)
    last_discovered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    default_risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="high")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    tool_overrides: Mapped[list["MCPToolOverride"]] = relationship(
        back_populates="server", cascade="all, delete-orphan"
    )


class MCPToolOverride(Base):
    """Per-tool risk level / enabled overrides for an MCP server."""
    __tablename__ = "mcp_tool_overrides"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mcp_server_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(200), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    server: Mapped["MCPServer"] = relationship(back_populates="tool_overrides")

    __table_args__ = (
        UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_overrides"),
    )


class HITLRequest(Base):
    """Human-in-the-loop approval request for a high-risk agent tool call."""
    __tablename__ = "hitl_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    tool_id: Mapped[str] = mapped_column(String(255), nullable=False)
    tool_input: Mapped[dict] = mapped_column(JSONB, nullable=False)
    action_summary: Mapped[str] = mapped_column(Text, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="high")
    agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_hitl_requests_workspace_status", "workspace_id", "status"),
        Index("idx_hitl_requests_conversation", "conversation_id"),
        Index("idx_hitl_requests_status", "status", "created_at"),
    )


# Transitional. Scheduled for replacement in later phase.
class AgentExecution(Base):
    """Tracks individual agent execution runs."""
    __tablename__ = "agent_executions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    iteration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tool_calls_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_usage: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    timeline: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_agent_exec_workspace", "workspace_id", "started_at"),
        Index(
            "idx_agent_exec_status",
            "status",
            postgresql_where="status IN ('running', 'paused_hitl', 'queued')",
        ),
    )


class ToolPermission(Base):
    """Per-tool permission overrides (user-configured)."""
    __tablename__ = "tool_permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tool_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    permission: Mapped[str] = mapped_column(String(20), nullable=False, default="default")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )


class TaskLog(Base):
    """Audit log for background task executions."""
    __tablename__ = "task_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    task_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    item_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_link: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_task_logs_started", "started_at"),
        Index("idx_task_logs_type", "task_type", "started_at"),
    )


class AgentMemory(Base):
    """Persistent agent memory entries with vector embeddings and time-weighted recall."""
    __tablename__ = "agent_memory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    memory_type: Mapped[str] = mapped_column(String(20), nullable=False, default="observation")
    decay_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.01)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    last_accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    __table_args__ = (
        Index("idx_agent_memory_workspace", "workspace_id", "is_active"),
        Index("idx_agent_memory_agent", "agent_id", "is_active"),
    )

# =============================================================================
# NEW DOMAIN MODELS
# =============================================================================

# These models represent the final architecture nouns and will be used
# for all new development. They align with the canonical product vocabulary.


class AgentProfileModel(Base):
    """Agent Profile - a worker abstraction defining capabilities."""
    __tablename__ = "agent_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    role: Mapped[str] = mapped_column(String(50), default="assistant")
    system_prompt_ref: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    model_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    memory_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    safety_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    capability_bundle_ids: Mapped[list] = mapped_column(JSONB, default=list)
    output_contract_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Catalog metadata
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    catalog_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class WorkflowDefinitionModel(Base):
    """Workflow Definition - a composable execution graph."""
    __tablename__ = "workflow_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    entry_node: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state_schema: Mapped[dict] = mapped_column(JSONB, default=dict)
    nodes: Mapped[list] = mapped_column(JSONB, default=list)
    edges: Mapped[list] = mapped_column(JSONB, default=list)
    default_input_schema: Mapped[dict] = mapped_column(JSONB, default=dict)
    default_output_schema: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    template_kind: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    template_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    # Catalog metadata
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_priority: Mapped[int] = mapped_column(Integer, default=0)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("idx_workflow_definitions_workspace_status", "workspace_id", "status"),
    )


class WorkflowVersionModel(Base):
    """Versioned executable graph snapshot for a workflow."""
    __tablename__ = "workflow_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    state_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    entry_node_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    default_input_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    default_output_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("workflow_id", "version_number", name="uq_workflow_versions_workflow_version"),
    )


class WorkflowNodeModel(Base):
    """Node within a workflow version."""
    __tablename__ = "workflow_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    node_key: Mapped[str] = mapped_column(String(120), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_json: Mapped[dict] = mapped_column("config", JSONB, nullable=False, default=dict)
    executor_ref: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    input_mapping_json: Mapped[dict] = mapped_column("input_mapping", JSONB, nullable=False, default=dict)
    output_mapping_json: Mapped[dict] = mapped_column("output_mapping", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("workflow_version_id", "node_key", name="uq_workflow_nodes_version_key"),
    )


class WorkflowEdgeModel(Base):
    """Directed edge between workflow nodes."""
    __tablename__ = "workflow_edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    edge_type: Mapped[str] = mapped_column(String(50), nullable=False, default="success")
    condition_json: Mapped[dict] = mapped_column("condition", JSONB, nullable=False, default=dict)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("idx_workflow_edges_version_priority", "workflow_version_id", "priority"),
    )


class MissionDefinitionModel(Base):
    """Mission Definition - a packaged autonomous unit."""
    __tablename__ = "mission_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    workflow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    workflow_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    default_profile_ids: Mapped[list] = mapped_column(JSONB, default=list)
    default_trigger_ids: Mapped[list] = mapped_column(JSONB, default=list)
    autonomy_mode: Mapped[str] = mapped_column(String(50), default="supervised")
    approval_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    budget_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    output_artifact_types: Mapped[list] = mapped_column(JSONB, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    recommended_use_case: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    # Catalog metadata
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    catalog_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_priority: Mapped[int] = mapped_column(Integer, default=0)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Health metadata
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    health_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="unknown")
    last_error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class TriggerDefinitionModel(Base):
    """Trigger Definition - an automation rule."""
    __tablename__ = "trigger_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    schedule_expression: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    interval_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    event_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payload_template: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    last_fired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_fire_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class TriggerFireHistoryModel(Base):
    """Record of a trigger firing event."""
    __tablename__ = "trigger_fire_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trigger_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    launch_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class MissionBudgetPolicyModel(Base):
    """Budget policy for constraining Mission execution."""
    __tablename__ = "mission_budget_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_runs_per_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_runs_per_window: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    window_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_concurrent_runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_token_budget_per_window: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cooldown_seconds_after_failure: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class RunModel(Base):
    """Run - an execution instance."""
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_type: Mapped[str] = mapped_column(String(50), nullable=False)
    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    workflow_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    trigger_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    parent_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    root_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    spawned_by_step_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    state_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    input_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    output_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    current_node_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    delegation_mode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    merge_strategy: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    join_group_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    branch_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    branch_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    handoff_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    composite_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("idx_runs_workspace_status", "workspace_id", "status"),
        Index("idx_runs_root_status", "root_run_id", "status"),
    )


class RunStepModel(Base):
    """Durable execution step within a run."""
    __tablename__ = "run_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    node_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    node_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    step_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    input_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    delegation_mode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    merge_strategy: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    join_group_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    branch_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    branch_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    handoff_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    composite_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    checkpoint_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("run_id", "step_index", name="uq_run_steps_run_step_index"),
    )


class CheckpointModel(Base):
    """Persisted run checkpoint."""
    __tablename__ = "checkpoints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True
    )
    checkpoint_type: Mapped[str] = mapped_column(String(50), nullable=False, default="after_step")
    state_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("idx_checkpoints_run_created", "run_id", "created_at"),
    )


class RuntimeEventModel(Base):
    """Persisted runtime event for a run."""
    __tablename__ = "runtime_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True
    )
    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    workflow_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    node_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    node_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload_json: Mapped[dict] = mapped_column("payload", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("idx_runtime_events_run_created", "run_id", "created_at"),
    )


class ArtifactModel(Base):
    """Artifact - an output produced by a mission run."""
    __tablename__ = "artifacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    source_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    source_workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    source_mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    source_profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[dict] = mapped_column(JSONB, default=dict)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    visibility: Mapped[str] = mapped_column(String(50), nullable=False, default="workspace")
    creation_mode: Mapped[str] = mapped_column(String(50), nullable=False, default="user_created")
    current_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    tags_json: Mapped[list] = mapped_column("tags", JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("idx_artifacts_workspace_status", "workspace_id", "status"),
        Index("idx_artifacts_workspace_type", "workspace_id", "artifact_type"),
        Index("idx_artifacts_workspace_visibility", "workspace_id", "visibility"),
    )


class ArtifactVersionModel(Base):
    """Historical content version for an artifact."""
    __tablename__ = "artifact_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    artifact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="structured_payload")
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    structured_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    source_evidence_packet_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    created_by_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("artifact_id", "version_number", name="uq_artifact_versions_artifact_version"),
    )


class ArtifactLinkModel(Base):
    """Lineage relationship between an artifact and another product object."""
    __tablename__ = "artifact_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    artifact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artifact_versions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    link_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("idx_artifact_links_artifact_link_type", "artifact_id", "link_type"),
        Index("idx_artifact_links_target", "target_type", "target_id"),
    )


class ArtifactSinkModel(Base):
    """Sink or destination state for artifact publication/export."""
    __tablename__ = "artifact_sinks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    artifact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sink_type: Mapped[str] = mapped_column(String(50), nullable=False)
    sink_state: Mapped[str] = mapped_column(String(50), nullable=False, default="configured")
    destination_ref: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(50), nullable=False, default="not_published")
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class PromptDefinitionModel(Base):
    """Managed prompt definition with the active template snapshot."""
    __tablename__ = "prompt_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_type: Mapped[str] = mapped_column(String(50), nullable=False)
    template: Mapped[str] = mapped_column(Text, nullable=False)
    template_format: Mapped[str] = mapped_column(String(50), nullable=False, default="format_string")
    variable_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    fallback_behavior: Mapped[str] = mapped_column(String(50), nullable=False, default="error")
    owner_type: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    owner_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class PromptVersionModel(Base):
    """Historical snapshot of a managed prompt definition."""
    __tablename__ = "prompt_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prompt_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    template: Mapped[str] = mapped_column(Text, nullable=False)
    template_format: Mapped[str] = mapped_column(String(50), nullable=False, default="format_string")
    variable_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("prompt_definition_id", "version", name="uq_prompt_versions_definition_version"),
    )


class PromptUsageLogModel(Base):
    """Audit trail for managed prompt rendering and use."""
    __tablename__ = "prompt_usage_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prompt_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    prompt_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prompt_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    owner_type: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    owner_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    render_context: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    variable_keys: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    rendered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class ToolPolicyModel(Base):
    """Structured tool access policy."""
    __tablename__ = "tool_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    scope_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    default_action: Mapped[str] = mapped_column(String(50), nullable=False, default="allow")
    rules: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    rate_limits: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    allowed_tools: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    blocked_tools: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    approval_required_tools: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class SafetyPolicyModel(Base):
    """Safety defaults that describe trust and untrusted-content behavior."""
    __tablename__ = "safety_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    scope_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rules: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class ApprovalPolicyModel(Base):
    """Approval defaults and escalation rules."""
    __tablename__ = "approval_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    scope_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    default_action: Mapped[str] = mapped_column(String(50), nullable=False, default="requires_approval")
    rules: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class PolicyRuleEntryModel(Base):
    """Normalised policy rule rows for later expansion and diagnostics."""
    __tablename__ = "policy_rule_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    policy_type: Mapped[str] = mapped_column(String(50), nullable=False)
    policy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    tool_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    risk_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    action: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)


class ApprovalRequestModel(Base):
    """Durable approval request record."""
    __tablename__ = "approval_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_type: Mapped[str] = mapped_column(String(50), nullable=False, default="tool_invocation")
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False, default="workspace")
    scope_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    requested_action: Mapped[str] = mapped_column(Text, nullable=False)
    tool_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reason_code: Mapped[str] = mapped_column(String(100), nullable=False)
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)
    risk_category: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_preview: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    matched_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    matched_rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_approval_requests_status", "status", "requested_at"),
    )


class RetrievalQueryModel(Base):
    """Top-level record for an explicit retrieval search request."""
    __tablename__ = "retrieval_queries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_query: Mapped[str] = mapped_column(Text, nullable=False)
    search_strategy: Mapped[str] = mapped_column(String(100), nullable=False, default="hybrid_rrf")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed")
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class RetrievalSearchResultModel(Base):
    """Candidate or selected result returned by a retrieval query."""
    __tablename__ = "retrieval_search_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("retrieval_queries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    knowledge_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    header_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    parent_excerpt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rank_position: Mapped[int] = mapped_column(Integer, nullable=False)
    strategy: Mapped[str] = mapped_column(String(100), nullable=False, default="hybrid_rrf")
    result_status: Mapped[str] = mapped_column(String(50), nullable=False, default="candidate")
    opened: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    summary_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    selection_reason_codes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    trust_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("idx_retrieval_search_results_source", "source_type", "source_id"),
        Index("idx_retrieval_search_results_status", "query_id", "result_status"),
    )


class EvidencePacketModel(Base):
    """Durable evidence packet assembled from explicit reads."""
    __tablename__ = "evidence_packets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    query_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("retrieval_queries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    packet_status: Mapped[str] = mapped_column(String(50), nullable=False, default="ready")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_json: Mapped[list] = mapped_column("items", JSONB, nullable=False, default=list)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class ConversationSummaryModel(Base):
    """Persisted conversation memory summary snapshots."""
    __tablename__ = "conversation_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    summary_type: Mapped[str] = mapped_column(String(50), nullable=False, default="conversation_memory")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    threshold_message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    keep_recent_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recent_messages_json: Mapped[list] = mapped_column("recent_messages", JSONB, nullable=False, default=list)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("conversation_id", "version", name="uq_conversation_summaries_conversation_version"),
    )


class ToolOutputSummaryModel(Base):
    """Summarized or truncated tool output used for prompt-safe context."""
    __tablename__ = "tool_output_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    call_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    summary_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    handling_mode: Mapped[str] = mapped_column(String(50), nullable=False, default="inline")
    raw_char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    raw_token_estimate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    preview: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


# =============================================================================
# Graph Domain Models
# =============================================================================


class GraphExtractionJobModel(Base):
    """Tracks entity/relationship extraction jobs."""
    __tablename__ = "graph_extraction_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")
    entity_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    relationship_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("ix_graph_extraction_jobs_source", "source_type", "source_id"),
        Index("ix_graph_extraction_jobs_status", "status"),
    )


class GraphExtractionResultModel(Base):
    """Durable extraction output for a graph extraction job."""
    __tablename__ = "graph_extraction_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    extraction_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("graph_extraction_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_mentions_json: Mapped[list] = mapped_column("entity_mentions", JSONB, nullable=False, default=list)
    relationship_mentions_json: Mapped[list] = mapped_column("relationship_mentions", JSONB, nullable=False, default=list)
    canonicalization_records_json: Mapped[list] = mapped_column(
        "canonicalization_records",
        JSONB,
        nullable=False,
        default=list,
    )
    errors_json: Mapped[list] = mapped_column("errors", JSONB, nullable=False, default=list)
    notes_json: Mapped[list] = mapped_column("notes", JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class EntityModel(Base):
    """Canonical entity in the knowledge graph."""
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_key: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, default="generic", index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attributes_json: Mapped[dict] = mapped_column("attributes", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class EntityMentionModel(Base):
    """Raw entity mention before canonicalization."""
    __tablename__ = "entity_mentions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    extraction_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("graph_extraction_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    mention_text: Mapped[str] = mapped_column(String(500), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, default="generic")
    context_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(100), nullable=False, default="llm")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    resolution_status: Mapped[str] = mapped_column(String(50), nullable=False, default="unresolved", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("ix_entity_mentions_source", "source_type", "source_id"),
    )


class EntityAliasModel(Base):
    """Alternative name for a canonical entity."""
    __tablename__ = "entity_aliases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    alias_type: Mapped[str] = mapped_column(String(100), nullable=False, default="alternate_name")
    source_mention_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entity_mentions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)


class EntityCanonicalizationRecordModel(Base):
    """Tracks why an entity mention resolved to a canonical entity."""
    __tablename__ = "entity_canonicalization_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mention_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entity_mentions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonicalization_state: Mapped[str] = mapped_column(String(50), nullable=False, default="resolved")
    match_type: Mapped[str] = mapped_column(String(100), nullable=False)
    match_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)


class RelationshipModel(Base):
    """Canonical relationship between entities."""
    __tablename__ = "relationships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    object_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    predicate: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    relationship_type: Mapped[str] = mapped_column(String(100), nullable=False, default="generic")
    attributes_json: Mapped[dict] = mapped_column("attributes", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    support_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    directionality: Mapped[str] = mapped_column(String(50), nullable=False, default="directed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class RelationshipMentionModel(Base):
    """Raw relationship mention before canonicalization."""
    __tablename__ = "relationship_mentions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    extraction_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("graph_extraction_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_relationship_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("relationships.id", ondelete="SET NULL"), nullable=True, index=True
    )
    subject_mention_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entity_mentions.id", ondelete="CASCADE"), nullable=False
    )
    object_mention_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entity_mentions.id", ondelete="CASCADE"), nullable=False
    )
    predicate: Mapped[str] = mapped_column(String(200), nullable=False)
    source_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(100), nullable=False, default="llm")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    resolution_status: Mapped[str] = mapped_column(String(50), nullable=False, default="unresolved", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("ix_relationship_mentions_source", "source_type", "source_id"),
    )


class GraphProvenanceLinkModel(Base):
    """Provenance link from graph objects to source material."""
    __tablename__ = "graph_provenance_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    graph_object_type: Mapped[str] = mapped_column(String(50), nullable=False)
    graph_object_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    excerpt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    char_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    char_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    extraction_method: Mapped[str] = mapped_column(String(100), nullable=False, default="llm")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("ix_graph_provenance_links_graph_object", "graph_object_type", "graph_object_id"),
        Index("ix_graph_provenance_links_source", "source_type", "source_id"),
    )


# =============================================================================
# Profile Models
# =============================================================================


class CapabilityBundleModel(Base):
    """Composable bundle of agent capabilities (tools, skills, retrieval)."""
    __tablename__ = "capability_bundles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Tool capabilities
    tools_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_tool_categories: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    blocked_tool_ids: Mapped[list] = mapped_column(JSONB, default=list)
    tool_overrides: Mapped[dict] = mapped_column(JSONB, default=dict)
    max_tool_calls_per_minute: Mapped[int] = mapped_column(Integer, default=30)
    max_tool_calls_per_execution: Mapped[int] = mapped_column(Integer, default=200)

    # Skill capabilities
    skill_ids: Mapped[list] = mapped_column(JSONB, default=list)

    # Retrieval capabilities
    retrieval_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    retrieval_limit: Mapped[int] = mapped_column(Integer, default=5)
    retrieval_score_threshold: Mapped[float] = mapped_column(Float, default=0.35)
    knowledge_scope: Mapped[str] = mapped_column(String(50), default="workspace")

    # Metadata
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class ModelPolicyModel(Base):
    """Policy for LLM model selection and usage constraints."""
    __tablename__ = "model_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    default_provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    default_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    allow_runtime_override: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_models: Mapped[list] = mapped_column(JSONB, default=list)
    blocked_models: Mapped[list] = mapped_column(JSONB, default=list)
    max_tokens_per_request: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_tokens_per_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class MemoryPolicyModel(Base):
    """Policy for context assembly and memory management."""
    __tablename__ = "memory_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    history_limit: Mapped[int] = mapped_column(Integer, default=20)
    history_strategy: Mapped[str] = mapped_column(String(50), default="sliding_window")
    attachment_support: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_bookmark_urls: Mapped[bool] = mapped_column(Boolean, default=True)
    mention_support: Mapped[bool] = mapped_column(Boolean, default=True)

    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class OutputContractModel(Base):
    """Contract defining expected output format and behavior."""
    __tablename__ = "output_contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    execution_mode: Mapped[str] = mapped_column(String(50), default="streaming")
    require_structured_output: Mapped[bool] = mapped_column(Boolean, default=False)
    output_schema: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    require_citations: Mapped[bool] = mapped_column(Boolean, default=False)

    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


# =============================================================================
# Observability & Evaluation Models
# =============================================================================


class UsageRecordModel(Base):
    """Tracks token/cost/resource usage at run and step granularity."""
    __tablename__ = "usage_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True
    )
    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    record_type: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    provider_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    reasoning_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    request_count: Mapped[int] = mapped_column(Integer, default=1)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_usage_records_run_created", "run_id", "created_at"),
        Index("idx_usage_records_ws_type_created", "workspace_id", "record_type", "created_at"),
        Index(
            "idx_usage_records_mission_created", "mission_id", "created_at",
            postgresql_where="mission_id IS NOT NULL",
        ),
    )


class FailureEventModel(Base):
    """Structured failure recording with taxonomy classification."""
    __tablename__ = "failure_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    step_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True
    )
    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    trigger_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    failure_class: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    error_code: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="error")
    retryability: Mapped[str] = mapped_column(String(20), nullable=False, default="not_retryable")
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    detail_json: Mapped[dict] = mapped_column("detail", JSONB, default=dict)
    affected_node_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    related_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    related_approval_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_failure_events_ws_class_created", "workspace_id", "failure_class", "created_at"),
        Index("idx_failure_events_run_created", "run_id", "created_at"),
        Index(
            "idx_failure_events_mission_created", "mission_id", "created_at",
            postgresql_where="mission_id IS NOT NULL",
        ),
    )


class EvaluationScenarioModel(Base):
    """Golden task / benchmark scenario definition."""
    __tablename__ = "evaluation_scenarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    suite_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    scenario_type: Mapped[str] = mapped_column(String(50), nullable=False, default="golden_task")
    input_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    expected_behaviors: Mapped[list] = mapped_column(JSONB, default=list)
    expected_output_constraints: Mapped[dict] = mapped_column(JSONB, default=dict)
    workflow_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    profile_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    mission_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    evaluation_metrics: Mapped[list] = mapped_column(JSONB, default=list)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class EvaluationRunModel(Base):
    """A specific execution of evaluation scenarios."""
    __tablename__ = "evaluation_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    suite_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    scenario_count: Mapped[int] = mapped_column(Integer, default=0)
    passed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    total_cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    baseline_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class EvaluationResultModel(Base):
    """Individual scenario result within an evaluation run."""
    __tablename__ = "evaluation_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    evaluation_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluation_scenarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    metrics_json: Mapped[dict] = mapped_column("metrics", JSONB, default=dict)
    threshold_results_json: Mapped[dict] = mapped_column("threshold_results", JSONB, default=dict)
    output_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comparison_baseline_json: Mapped[dict] = mapped_column("comparison_baseline", JSONB, default=dict)
    artifacts_produced: Mapped[list] = mapped_column(JSONB, default=list)
    cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class EvaluationBaselineModel(Base):
    """Baseline metric snapshots for regression detection."""
    __tablename__ = "evaluation_baselines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    suite_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_evaluation_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluation_runs.id", ondelete="SET NULL"), nullable=True
    )
    metrics_snapshot_json: Mapped[dict] = mapped_column("metrics_snapshot", JSONB, default=dict)
    thresholds_json: Mapped[dict] = mapped_column("thresholds", JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
