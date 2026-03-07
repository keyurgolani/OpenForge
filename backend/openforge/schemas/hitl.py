"""
HITL (Human-in-the-Loop) S for OpenForge.

Pydantic schemas for HITL approval requests.
"""
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from uuid import UUID


class HITLRequestBase(BaseModel):
    """Base schema for HITL request."""
    id: UUID
    workspace_id: UUID
    conversation_id: Optional[UUID] = None
    execution_id: UUID
    tool_id: str
    tool_display_name: Optional[str] = None
    tool_input: dict[str, Any]
    agent_state: dict[str, Any]
    status: str = "pending"  # pending, approved, denied
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None


class HITLRequestCreate(BaseModel):
    """Schema for creating an HITL request."""
    workspace_id: UUID
    conversation_id: Optional[UUID] = None
    execution_id: UUID
    tool_id: str
    tool_input: dict[str, Any]
    agent_state: dict[str, Any]


class HITLRequestResponse(HITLRequestBase):
    """Response schema for HITL request."""
    tool_display_name: Optional[str] = None
    workspace_name: Optional[str] = None
    conversation_title: Optional[str] = None


class HITLResolveRequest(BaseModel):
    """Schema for resolving an HITL request."""
    resolution_note: Optional[str] = None


class HITLAuditEntry(BaseModel):
    """Schema for HITL audit log entry."""
    id: UUID
    request_id: UUID
    workspace_id: UUID
    action: str  # created, approved, denied
    actor: Optional[str] = None  # User who performed the action
    details: Optional[dict[str, Any]] = None
    created_at: datetime


class HITLListParams(BaseModel):
    """Parameters for listing HITL requests."""
    workspace_id: Optional[UUID] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20
