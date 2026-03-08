import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Text, Boolean, Integer, Float, DateTime, ForeignKey,
    Index, CheckConstraint, LargeBinary, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped, relationship
from typing import Optional, List, Dict, Any


def now_utc():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ═══════════════════════════════════════════════════════════════════════════════
# Core Configuration Models
# ═══════════════════════════════════════════════════════════════════════════════

class Config(Base):
    __tablename__ = "config"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )


# ═══════════════════════════════════════════════════════════════════════════════
# LLM Provider Models (v3 - redesigned for composable virtual providers)
# ═══════════════════════════════════════════════════════════════════════════════

class LLMProvider(Base):
    """Standard LLM provider — an API connection with credentials."""
    __tablename__ = "llm_providers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider_name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    api_key_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    endpoint_id: Mapped[str] = mapped_column(String(50), nullable=False, default="default")
    base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    models: Mapped[list["LLMModel"]] = relationship(back_populates="provider", cascade="all, delete-orphan")


class LLMModel(Base):
    """A discovered/registered model for a standard provider."""
    __tablename__ = "llm_models"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=False
    )
    model_id: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    capabilities: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)  # ["chat", "vision"]
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    provider: Mapped["LLMProvider"] = relationship(back_populates="models")

    __table_args__ = (
        UniqueConstraint("provider_id", "model_id", name="uq_llm_model_provider_model"),
    )


class LLMVirtualProvider(Base):
    """Virtual provider — orchestrates multiple endpoints (router, council, optimizer)."""
    __tablename__ = "llm_virtual_providers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    virtual_type: Mapped[str] = mapped_column(String(20), nullable=False)  # router, council, optimizer
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    router_config: Mapped[Optional["LLMRouterConfig"]] = relationship(
        back_populates="virtual_provider", uselist=False, cascade="all, delete-orphan"
    )
    council_config: Mapped[Optional["LLMCouncilConfig"]] = relationship(
        back_populates="virtual_provider", uselist=False, cascade="all, delete-orphan"
    )
    optimizer_config: Mapped[Optional["LLMOptimizerConfig"]] = relationship(
        back_populates="virtual_provider", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "virtual_type IN ('router', 'council', 'optimizer')",
            name="ck_virtual_type",
        ),
    )


class LLMEndpoint(Base):
    """Unified model reference — points to either a standard provider+model or a virtual provider.

    This is the core abstraction enabling composability: anywhere a model is needed,
    an endpoint ID is used. The endpoint can resolve to a direct LLM call or recursively
    through virtual providers.
    """
    __tablename__ = "llm_endpoints"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    endpoint_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "standard" or "virtual"
    display_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Standard endpoint fields
    provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=True
    )
    model_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Virtual endpoint field
    virtual_provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"), nullable=True
    )
    # System defaults
    is_default_chat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_default_vision: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_default_tts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_default_stt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    provider: Mapped[Optional["LLMProvider"]] = relationship(foreign_keys=[provider_id])
    virtual_provider: Mapped[Optional["LLMVirtualProvider"]] = relationship(foreign_keys=[virtual_provider_id])

    __table_args__ = (
        CheckConstraint(
            "endpoint_type IN ('standard', 'virtual')",
            name="ck_endpoint_type",
        ),
        CheckConstraint(
            "(endpoint_type = 'standard' AND provider_id IS NOT NULL AND model_id IS NOT NULL AND virtual_provider_id IS NULL) OR "
            "(endpoint_type = 'virtual' AND virtual_provider_id IS NOT NULL AND provider_id IS NULL AND model_id IS NULL)",
            name="ck_endpoint_consistency",
        ),
        Index(
            "idx_llm_endpoints_default_chat",
            "is_default_chat",
            unique=True,
            postgresql_where="is_default_chat = TRUE",
        ),
        Index(
            "idx_llm_endpoints_default_vision",
            "is_default_vision",
            unique=True,
            postgresql_where="is_default_vision = TRUE",
        ),
        Index(
            "idx_llm_endpoints_default_tts",
            "is_default_tts",
            unique=True,
            postgresql_where="is_default_tts = TRUE",
        ),
        Index(
            "idx_llm_endpoints_default_stt",
            "is_default_stt",
            unique=True,
            postgresql_where="is_default_stt = TRUE",
        ),
    )


# ── Router ────────────────────────────────────────────────────────────────────

class LLMRouterConfig(Base):
    """Configuration for a router virtual provider."""
    __tablename__ = "llm_router_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    virtual_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Routing model — an endpoint (can be standard or virtual for full composability)
    routing_endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    routing_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    virtual_provider: Mapped["LLMVirtualProvider"] = relationship(back_populates="router_config")
    routing_endpoint: Mapped["LLMEndpoint"] = relationship(foreign_keys=[routing_endpoint_id])
    tiers: Mapped[list["LLMRouterTier"]] = relationship(back_populates="router_config", cascade="all, delete-orphan")


class LLMRouterTier(Base):
    """A complexity tier within a router — target is an endpoint (composable)."""
    __tablename__ = "llm_router_tiers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    router_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_router_config.id", ondelete="CASCADE"), nullable=False
    )
    complexity_level: Mapped[str] = mapped_column(String(20), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    router_config: Mapped["LLMRouterConfig"] = relationship(back_populates="tiers")
    endpoint: Mapped["LLMEndpoint"] = relationship(foreign_keys=[endpoint_id])

    __table_args__ = (
        Index("idx_router_tiers_config", "router_config_id", "complexity_level", "priority"),
    )


# ── Council ───────────────────────────────────────────────────────────────────

class LLMCouncilConfig(Base):
    """Configuration for a council virtual provider."""
    __tablename__ = "llm_council_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    virtual_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Chairman — an endpoint (composable)
    chairman_endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    judging_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parallel_execution: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    virtual_provider: Mapped["LLMVirtualProvider"] = relationship(back_populates="council_config")
    chairman_endpoint: Mapped["LLMEndpoint"] = relationship(foreign_keys=[chairman_endpoint_id])
    members: Mapped[list["LLMCouncilMember"]] = relationship(back_populates="council_config", cascade="all, delete-orphan")


class LLMCouncilMember(Base):
    """A member of a council — target is an endpoint (composable)."""
    __tablename__ = "llm_council_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    council_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_council_config.id", ondelete="CASCADE"), nullable=False
    )
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    display_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    council_config: Mapped["LLMCouncilConfig"] = relationship(back_populates="members")
    endpoint: Mapped["LLMEndpoint"] = relationship(foreign_keys=[endpoint_id])


# ═══════════════════════════════════════════════════════════════════════════════
# Workspace and Knowledge Models
# ═══════════════════════════════════════════════════════════════════════════════

class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    # v3: Endpoint-based model assignment (replaces provider_id + model pairs)
    chat_endpoint_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="SET NULL"), nullable=True
    )
    vision_endpoint_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    # v2.5: Agent and tools
    tools_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    chat_endpoint: Mapped[Optional["LLMEndpoint"]] = relationship(foreign_keys=[chat_endpoint_id])
    vision_endpoint: Mapped[Optional["LLMEndpoint"]] = relationship(foreign_keys=[vision_endpoint_id])
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
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="knowledge")
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Bookmark fields
    url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    url_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    url_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Gist fields
    gist_language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # v2: File-based knowledge fields
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Common fields
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    insights: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ai_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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


# ═══════════════════════════════════════════════════════════════════════════════
# Conversation and Message Models
# ═══════════════════════════════════════════════════════════════════════════════

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
    # v2: Tool call tracking for agent messages
    tool_calls: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    execution_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_executions.id", ondelete="SET NULL"), nullable=True
    )
    # v2.5: Provider metadata for router/council/optimizer tracking
    provider_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
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
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    message: Mapped[Optional["Message"]] = relationship(back_populates="attachments")

    __table_args__ = (
        Index("idx_message_attachments_message", "message_id"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# MCP Server and Tool Models
# ═══════════════════════════════════════════════════════════════════════════════

class MCPServer(Base):
    """External MCP server registry."""
    __tablename__ = "mcp_servers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auth_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    auth_value_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Cached tool list from last successful discovery
    discovered_tools: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    last_discovered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Default risk level for tools from this server
    default_risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="high")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    tool_overrides: Mapped[list["MCPToolOverride"]] = relationship(back_populates="mcp_server", cascade="all, delete-orphan")


class MCPToolOverride(Base):
    """Per-tool risk level overrides for external MCP tools."""
    __tablename__ = "mcp_tool_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    mcp_server_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(200), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    mcp_server: Mapped["MCPServer"] = relationship(back_populates="tool_overrides")

    __table_args__ = (
        UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_override"),
    )


class ToolDefinition(Base):
    """Registry of built-in tools available to agents."""
    __tablename__ = "tool_definitions"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    input_schema: Mapped[dict] = mapped_column(JSONB, nullable=False)
    output_schema: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    requires_workspace_scope: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Agent Execution and HITL Models
# ═══════════════════════════════════════════════════════════════════════════════

class AgentExecution(Base):
    """Tracking for agent loop executions."""
    __tablename__ = "agent_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )
    # Execution state
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    # Agent loop metrics
    iteration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tool_calls: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Serialized agent state (for HITL resume)
    checkpoint_state: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_agent_exec_workspace", "workspace_id", "started_at"),
        Index("idx_agent_exec_status", "status", postgresql_where="status IN ('running', 'paused_hitl')"),
    )


class HITLRequest(Base):
    """Human-in-the-loop approval requests."""
    __tablename__ = "hitl_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    # The agent execution that triggered this request
    execution_id: Mapped[str] = mapped_column(String(200), nullable=False)
    # Serialized agent state (for resume after approval)
    agent_state: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Tool call details
    tool_id: Mapped[str] = mapped_column(String(100), nullable=False)
    tool_input: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Human-readable description of what the agent wants to do
    action_summary: Mapped[str] = mapped_column(Text, nullable=False)
    # Status tracking
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Auto-expire after this duration
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    audit_log: Mapped[list["HITLAuditLog"]] = relationship(back_populates="hitl_request", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_hitl_pending", "status", "created_at", postgresql_where="status = 'pending'"),
        Index("idx_hitl_workspace", "workspace_id", "created_at"),
        Index("idx_hitl_conversation", "conversation_id", postgresql_where="conversation_id IS NOT NULL"),
    )


class HITLAuditLog(Base):
    """Audit log for all HITL decisions."""
    __tablename__ = "hitl_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    hitl_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hitl_requests.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # created, approved, denied, expired, cancelled
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    hitl_request: Mapped["HITLRequest"] = relationship(back_populates="audit_log")


# ═══════════════════════════════════════════════════════════════════════════════
# Utility Models
# ═══════════════════════════════════════════════════════════════════════════════

class Onboarding(Base):
    __tablename__ = "onboarding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    current_step: Mapped[str] = mapped_column(String(50), nullable=False, default="welcome")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("id = 1", name="onboarding_singleton"),
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


# ═══════════════════════════════════════════════════════════════════════════════
# v2.5 Models
# ═══════════════════════════════════════════════════════════════════════════════

class AgentDefinition(Base):
    """Agent definitions for the OpenForge v2.5 agent framework."""
    __tablename__ = "agent_definitions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # Tool settings
    tools_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    rag_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    rag_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default='5')
    rag_score_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.3, server_default='0.3')
    history_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20, server_default='20')
    max_iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default='10')
    allowed_tool_categories: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    allowed_tool_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    skill_hints: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    attachment_support: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    auto_bookmark_urls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )


class LLMOptimizerConfig(Base):
    """Configuration for an optimizer virtual provider."""
    __tablename__ = "llm_optimizer_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    virtual_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Optimizer model — an endpoint (composable)
    optimizer_endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    # Target — an endpoint (composable: could be standard, router, council, etc.)
    target_endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    optimization_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    additional_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )

    virtual_provider: Mapped["LLMVirtualProvider"] = relationship(back_populates="optimizer_config")
    optimizer_endpoint: Mapped["LLMEndpoint"] = relationship(foreign_keys=[optimizer_endpoint_id])
    target_endpoint: Mapped["LLMEndpoint"] = relationship(foreign_keys=[target_endpoint_id])


class ToolExecutionLog(Base):
    """Audit log for tool executions made by the agent."""
    __tablename__ = "tool_execution_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    execution_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tool_id: Mapped[str] = mapped_column(String(200), nullable=False)
    tool_display_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tool_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    input_params: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    output_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )

    __table_args__ = (
        Index("idx_tool_exec_logs_workspace", "workspace_id", "started_at"),
        Index("idx_tool_exec_logs_tool", "tool_id", "started_at"),
    )
