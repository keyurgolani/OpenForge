"""Core retrieval domain types."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field
from openforge.common.time import utc_now


class RetrievalSourceType(str, Enum):
    KNOWLEDGE = "knowledge"
    CONVERSATION = "conversation"
    FILE = "file"
    WEB = "web"
    TOOL_OUTPUT = "tool_output"
    UNKNOWN = "unknown"


class RetrievalResultStatus(str, Enum):
    CANDIDATE = "candidate"
    OPENED = "opened"
    IGNORED = "ignored"
    REJECTED = "rejected"
    SELECTED = "selected"


class EvidenceItemType(str, Enum):
    EXCERPT = "excerpt"
    SUMMARY = "summary"
    PARENT_CONTEXT = "parent_context"
    TOOL_OUTPUT = "tool_output"


class SummaryType(str, Enum):
    RETRIEVAL = "retrieval"
    CONVERSATION_MEMORY = "conversation_memory"
    TOOL_OUTPUT = "tool_output"


class ChunkType(str, Enum):
    PARENT = "parent"
    CHILD = "child"
    SUMMARY = "summary"


class SelectionReasonCode(str, Enum):
    TOP_RANKED = "top_ranked"
    USER_SELECTED = "user_selected"
    PARENT_EXPANSION = "parent_expansion"
    QUERY_MATCH_STRENGTH = "query_match_strength"
    EXPLICIT_WORKFLOW_REQUEST = "explicit_workflow_request"
    OPERATOR_OVERRIDE = "operator_override"


class ToolOutputHandlingMode(str, Enum):
    INLINE = "inline"
    TRUNCATED = "truncated"
    SUMMARIZED = "summarized"


class RetrievalQuery(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    workspace_id: UUID
    conversation_id: UUID | None = None
    run_id: UUID | None = None
    query_text: str
    normalized_query: str
    search_strategy: str = "hybrid_rrf"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(from_attributes=True)


class RetrievalSearchResult(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    query_id: UUID
    workspace_id: UUID
    source_type: RetrievalSourceType
    source_id: str
    title: str
    knowledge_type: str | None = None
    excerpt: str
    header_path: str | None = None
    parent_excerpt: str | None = None
    score: float
    rank_position: int
    strategy: str
    result_status: RetrievalResultStatus = RetrievalResultStatus.CANDIDATE
    selected: bool = False
    opened: bool = False
    summary_status: SummaryType | None = None
    selection_reason_codes: list[SelectionReasonCode] = Field(default_factory=list)
    trust_metadata: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class RetrievalReadResult(BaseModel):
    result_id: UUID
    query_id: UUID
    source_type: RetrievalSourceType
    source_id: str
    title: str
    content: str
    excerpt: str
    header_path: str | None = None
    parent_excerpt: str | None = None
    citation: dict[str, int] | None = None
    selected: bool = False
    opened: bool = True
    selection_reason_codes: list[SelectionReasonCode] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class EvidenceItem(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    item_type: EvidenceItemType = EvidenceItemType.EXCERPT
    source_type: RetrievalSourceType
    source_id: str
    title: str
    excerpt: str
    parent_excerpt: str | None = None
    citation: dict[str, int] | None = None
    selection_reason_codes: list[SelectionReasonCode] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class EvidencePacket(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    workspace_id: UUID
    query_id: UUID | None = None
    conversation_id: UUID | None = None
    run_id: UUID | None = None
    summary: str | None = None
    status: str = "ready"
    item_count: int = 0
    items: list[EvidenceItem] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(from_attributes=True)


class ConversationSummary(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    workspace_id: UUID
    conversation_id: UUID
    run_id: UUID | None = None
    summary_type: SummaryType = SummaryType.CONVERSATION_MEMORY
    version: int = 1
    summary: str
    recent_messages: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(from_attributes=True)


class ToolOutputProcessingResult(BaseModel):
    summary_type: SummaryType | None = None
    handling_mode: ToolOutputHandlingMode = ToolOutputHandlingMode.INLINE
    preview: str
    summary: str
    raw_output_reference: str | None = None
    raw_char_count: int
    raw_token_estimate: int
    was_truncated: bool = False


# =============================================================================
# Graph-Aware Retrieval Types
# =============================================================================


class GraphExpansionConfig(BaseModel):
    """Configuration for graph-aware retrieval expansion."""
    enabled: bool = False
    expand_depth: int = Field(default=1, ge=1, le=3, description="How many hops to expand")
    max_entities: int = Field(default=10, ge=1, le=50, description="Max entities to include")
    min_confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Minimum entity confidence")
    include_related_documents: bool = Field(default=True, description="Include documents related to entities")


class GraphExpansionResult(BaseModel):
    """Result of graph expansion during retrieval."""
    matched_entities: list[dict[str, Any]] = Field(default_factory=list, description="Entities matched from query")
    related_entities: list[dict[str, Any]] = Field(default_factory=list, description="Entities discovered via expansion")
    related_documents: list[dict[str, Any]] = Field(default_factory=list, description="Documents linked to entities")
    expansion_reason: str = Field(default="", description="Why expansion was performed")
    expansion_depth: int = Field(default=0, description="Actual depth used")
