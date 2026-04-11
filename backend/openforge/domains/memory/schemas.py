"""Pydantic schemas for the memory domain."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    content: str
    memory_type: str = Field(default="context", pattern="^(fact|preference|lesson|context|decision|experience)$")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    workspace_id: Optional[UUID] = None
    knowledge_id: Optional[UUID] = None
    source_agent_id: Optional[UUID] = None
    source_run_id: Optional[UUID] = None
    source_conversation_id: Optional[UUID] = None


class MemoryResponse(BaseModel):
    id: UUID
    content: str
    memory_type: str
    tier: str
    confidence: float
    observed_at: datetime
    promoted_at: Optional[datetime] = None
    invalidated_at: Optional[datetime] = None
    source_type: str
    workspace_id: Optional[UUID] = None
    tags: list[str] = []
    recall_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class MemoryRecallRequest(BaseModel):
    query: str
    memory_type: Optional[str] = None
    tags: Optional[list[str]] = None
    workspace_id: Optional[UUID] = None
    deep: bool = False
    limit: int = Field(default=10, ge=1, le=50)


class MemoryRecallResult(BaseModel):
    id: UUID
    content: str
    memory_type: str
    tier: str
    confidence: float
    score: float
    observed_at: datetime
    workspace_id: Optional[UUID] = None
    tags: list[str] = []
    source: str = "vector"


class MemoryForgetRequest(BaseModel):
    memory_id: UUID


class WALEntryResponse(BaseModel):
    id: UUID
    operation: str
    daemon: str
    memory_id: UUID
    created_at: datetime
    undone_at: Optional[datetime] = None
