"""Retrieval API request and response schemas."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .types import (
    ConversationSummary,
    EvidencePacket,
    RetrievalQuery,
    RetrievalReadResult,
    RetrievalSearchResult,
    SelectionReasonCode,
)


class RetrievalSearchRequest(BaseModel):
    workspace_id: UUID
    query_text: str = Field(..., min_length=1)
    conversation_id: UUID | None = None
    run_id: UUID | None = None
    knowledge_type: str | None = None
    tag: str | None = None
    limit: int = Field(default=10, ge=1, le=100)
    include_parent_context: bool = False
    deduplicate_sources: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievalSearchResponse(BaseModel):
    query: RetrievalQuery
    results: list[RetrievalSearchResult]
    total: int

    model_config = ConfigDict(from_attributes=True)


class RetrievalReadRequest(BaseModel):
    query_id: UUID
    result_ids: list[UUID] = Field(default_factory=list)
    include_parent_context: bool = False
    selection_reason_codes: list[SelectionReasonCode] = Field(default_factory=list)


class RetrievalReadResponse(BaseModel):
    query_id: UUID
    results: list[RetrievalReadResult]

    model_config = ConfigDict(from_attributes=True)


class EvidencePacketBuildRequest(BaseModel):
    workspace_id: UUID
    query_id: UUID | None = None
    conversation_id: UUID | None = None
    run_id: UUID | None = None
    items: list[dict[str, Any]]
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidencePacketResponse(BaseModel):
    packet: EvidencePacket

    model_config = ConfigDict(from_attributes=True)


class RetrievalQueryResponse(BaseModel):
    query: RetrievalQuery
    results: list[RetrievalSearchResult]

    model_config = ConfigDict(from_attributes=True)


class ConversationSummaryResponse(BaseModel):
    summary: ConversationSummary

    model_config = ConfigDict(from_attributes=True)
