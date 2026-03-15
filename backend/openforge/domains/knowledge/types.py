"""
Knowledge domain types.

This module defines the core types and enums for Knowledge.
"""

from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeType(str, Enum):
    """Types of knowledge items."""

    DOCUMENT = "document"
    NOTE = "note"
    BOOKMARK = "bookmark"
    FILE = "file"
    INSIGHT = "insight"


class KnowledgeStatus(str, Enum):
    """Status of a knowledge item."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class Knowledge(BaseModel):
    """
    Knowledge - user-provided context and data.

    Knowledge represents the information users provide to give context
    to AI processing. This is distinct from Artifacts (system-generated outputs).

    Attributes:
        id: Unique identifier
        knowledge_type: Type of knowledge item
        workspace_id: Workspace this knowledge belongs to
        title: Display title
        content: The knowledge content
        metadata: Additional metadata
        status: Current status
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: User who created this knowledge
        updated_by: User who last updated this knowledge
    """

    id: UUID = Field(...)
    knowledge_type: KnowledgeType = Field(...)
    workspace_id: UUID = Field(...)
    title: str = Field(..., min_length=1, max_length=500)
    content: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: KnowledgeStatus = Field(default=KnowledgeStatus.ACTIVE)

    model_config = ConfigDict(from_attributes=True)

    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)
