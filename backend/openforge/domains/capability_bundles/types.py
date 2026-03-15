"""Capability Bundle domain types."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class KnowledgeScope(str, Enum):
    """Knowledge scope for retrieval."""
    WORKSPACE = "workspace"
    GLOBAL = "global"
    ORGANIZATION = "organization"


class RetrievalStrategy(str, Enum):
    """Strategy for retrieving context."""
    HYBRID_RRF = "hybrid_rrf"
    VECTOR_ONLY = "vector_only"
    KEYWORD_ONLY = "keyword_only"
    SEMANTIC = "semantic"


class CapabilityBundle(BaseModel):
    """Composable bundle of agent capabilities."""
    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)

    # Tool capabilities
    tools_enabled: bool = Field(default=True)
    allowed_tool_categories: Optional[list[str]] = Field(default=None)
    blocked_tool_ids: list[str] = Field(default_factory=list)
    tool_overrides: dict[str, str] = Field(default_factory=dict)
    max_tool_calls_per_minute: int = Field(default=30, ge=1)
    max_tool_calls_per_execution: int = Field(default=200, ge=1)

    # Skill capabilities
    skill_ids: list[str] = Field(default_factory=list)

    # Retrieval capabilities
    retrieval_enabled: bool = Field(default=True)
    retrieval_limit: int = Field(default=5, ge=1)
    retrieval_score_threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    knowledge_scope: KnowledgeScope = Field(default=KnowledgeScope.WORKSPACE)
    retrieval_strategy: RetrievalStrategy = Field(default=RetrievalStrategy.HYBRID_RRF)

    # Metadata
    is_system: bool = Field(default=False)
    status: str = Field(default="active")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None
