import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Text, Boolean, Integer, Float, DateTime, ForeignKey,
    Index, CheckConstraint, LargeBinary, UniqueConstraint,
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
    intelligence_categories: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    vision_provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True
    )
    vision_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    agent_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, default="workspace_agent"
    )
    default_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    agent_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    agent_tool_categories: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)
    agent_max_tool_loops: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Ownership model for deployment workspaces
    ownership_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="user",
        comment="'user' = normal user workspace, 'deployment' = owned by a deployment",
    )
    owner_deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("deployments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="If ownership_type='deployment', the deployment that owns this workspace",
    )
    is_readonly_ui: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False,
        comment="If true, UI prevents user edits (knowledge CRUD disabled in frontend)",
    )
    auto_teardown: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
        comment="If true, workspace is deleted when owning deployment is torn down",
    )
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

    __table_args__ = (
        Index("idx_workspaces_ownership", "ownership_type", "owner_deployment_id"),
    )


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
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True
    )
    agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
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
    agent: Mapped[Optional["AgentDefinitionModel"]] = relationship(foreign_keys=[agent_id], lazy="joined")

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


class AgentExecution(Base):
    """Tracks individual agent execution runs."""
    __tablename__ = "agent_executions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True
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


# =============================================================================
# NEW DOMAIN MODELS
# =============================================================================

# These models represent the final architecture nouns and will be used
# for all new development. They align with the canonical product vocabulary.


class TriggerDefinitionModel(Base):
    """Trigger Definition - an automation rule."""
    __tablename__ = "trigger_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
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
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    launch_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class RunModel(Base):
    """Run - an execution instance."""
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    parent_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    root_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    spawned_by_step_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("deployments.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    mission_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("missions.id", ondelete="SET NULL"), nullable=True, index=True,
    )
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



class SinkModel(Base):
    """First-class sink definition — what happens with agent output values."""
    __tablename__ = "sinks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sink_type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags_json: Mapped[list] = mapped_column("tags", JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("idx_sinks_sink_type", "sink_type"),
    )


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
    )


# =============================================================================
# Agent-First Architecture Models
# =============================================================================


class AgentDefinitionModel(Base):
    """Agent definition — a workspace-agnostic AI assistant with structured config."""
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    mode: Mapped[str] = mapped_column("agent_mode", String(50), nullable=False, default="interactive")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    llm_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    tools_config: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    memory_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    parameters: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    output_definitions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    active_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compiled_agent_specs.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


# Backward-compat alias — existing code imports AgentModel
AgentModel = AgentDefinitionModel


class AgentDefinitionVersionModel(Base):
    """Immutable snapshot of a compiled agent configuration (version)."""
    __tablename__ = "compiled_agent_specs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        UniqueConstraint("agent_id", "version", name="uq_compiled_agent_specs_agent_version"),
    )


class AutomationModel(Base):
    """Automation - a workspace-agnostic agent-powered background task."""
    __tablename__ = "automations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    graph_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    active_spec_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compiled_automation_specs.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    health_status: Mapped[str] = mapped_column(String(50), nullable=False, default="unknown")
    last_error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    compilation_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    compilation_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_compiled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("idx_automations_status", "status"),
    )


class DeploymentModel(Base):
    """A live, deployed instance of an automation with baked-in inputs."""
    __tablename__ = "deployments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    agent_spec_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compiled_agent_specs.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    automation_spec_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compiled_automation_specs.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    deployed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    input_values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    trigger_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trigger_definitions.id", ondelete="SET NULL"), nullable=True,
    )
    last_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)
    torn_down_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Deployment-owned workspace for cross-run knowledge sharing
    owned_workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Optional workspace owned by this deployment for cross-run knowledge sharing",
    )
    workspace_provisioning: Mapped[str] = mapped_column(
        String(20), nullable=False, default="none",
        comment="'none' = no workspace, 'auto' = create on deploy",
    )


class CompiledAutomationSpecModel(Base):
    """Compiled automation specification - immutable snapshot of resolved automation config."""
    __tablename__ = "compiled_automation_specs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("automations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    resolved_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    agent_spec_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compiled_agent_specs.id", ondelete="SET NULL"),
        nullable=True,
    )
    trigger_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trigger_definitions.id", ondelete="SET NULL"),
        nullable=True,
    )
    graph_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    node_specs: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    compiler_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    validation_errors: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        UniqueConstraint("automation_id", "version", name="uq_compiled_automation_specs_automation_version"),
    )


class AutomationNodeModel(Base):
    """A single node (agent or sink) in an automation DAG."""
    __tablename__ = "automation_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    node_type: Mapped[str] = mapped_column(String(20), nullable=False, default="agent")
    agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True,
    )
    sink_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sink_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sinks.id", ondelete="SET NULL"), nullable=True,
    )
    node_key: Mapped[str] = mapped_column(String(120), nullable=False)
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("automation_id", "node_key", name="uq_automation_nodes_automation_node_key"),
    )


class AutomationEdgeModel(Base):
    """A wire between two nodes in an automation DAG."""
    __tablename__ = "automation_edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_nodes.id", ondelete="CASCADE"), nullable=False,
    )
    source_output_key: Mapped[str] = mapped_column(String(100), nullable=False, default="output")
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_nodes.id", ondelete="CASCADE"), nullable=False,
    )
    target_input_key: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        Index("ix_automation_edges_target", "automation_id", "target_node_id", "target_input_key"),
    )


class AutomationNodeInputModel(Base):
    """A static input value pre-filled on the canvas for a node."""
    __tablename__ = "automation_node_inputs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_nodes.id", ondelete="CASCADE"), nullable=False,
    )
    input_key: Mapped[str] = mapped_column(String(100), nullable=False)
    static_value: Mapped[dict] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        UniqueConstraint("node_id", "input_key", name="uq_automation_node_inputs_node_input"),
    )


class SkillTemplateModel(Base):
    """A built-in skill template that agents can reference for domain expertise."""
    __tablename__ = "skill_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)


class MissionModel(Base):
    """A goal-directed autonomous agent that runs continuously toward an objective."""
    __tablename__ = "missions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    directives: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    constraints: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    rubric: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    termination_conditions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    autonomous_agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="RESTRICT"), nullable=False,
    )
    agent_access: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {"mode": "all"})
    tool_overrides: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    phase_sinks: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True,
    )
    cadence: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    budget: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    current_plan: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    cycle_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_estimate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_cycle_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_cycle_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_missions_status_next_cycle", "status", "next_cycle_at"),
    )


class MissionCycleModel(Base):
    """A single OODA cycle within a mission."""
    __tablename__ = "mission_cycles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("missions.id", ondelete="CASCADE"), nullable=False,
    )
    cycle_number: Mapped[int] = mapped_column(Integer, nullable=False)
    phase: Mapped[str] = mapped_column(String(20), nullable=False, default="perceive")
    phase_summaries: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    actions_log: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    evaluation_scores: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ratchet_passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    next_cycle_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_cycle_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    primary_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True,
    )
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_estimate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("mission_id", "cycle_number", name="uq_mission_cycles_mission_number"),
        Index("ix_mission_cycles_mission_status", "mission_id", "status"),
    )
