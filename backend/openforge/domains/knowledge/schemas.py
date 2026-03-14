"""
Knowledge schemas for the future domain package.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from .types import KnowledgeStatus, KnowledgeType


class KnowledgeCreate(BaseModel):
    knowledge_type: KnowledgeType
    workspace_id: UUID
    title: str = Field(..., min_length=1, max_length=500)
    content: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: KnowledgeStatus = Field(default=KnowledgeStatus.ACTIVE)


class KnowledgeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    content: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None
    status: Optional[KnowledgeStatus] = None


class KnowledgeResponse(BaseModel):
    id: UUID
    knowledge_type: KnowledgeType
    workspace_id: UUID
    title: str
    content: dict[str, Any]
    metadata: dict[str, Any]
    status: KnowledgeStatus
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[UUID]
    updated_by: Optional[UUID]


class KnowledgeListResponse(BaseModel):
    knowledge: list[KnowledgeResponse]
    total: int
