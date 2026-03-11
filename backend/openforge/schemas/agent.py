"""Pydantic schemas for agent API endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class AgentDefinitionResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    version: str
    config: dict[str, Any] = {}
    is_system: bool = False
    is_default: bool = False
    icon: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class AgentDefinitionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    config: dict[str, Any] | None = None
    icon: str | None = None


class WorkspaceAgentUpdate(BaseModel):
    agent_id: str


class AgentExecutionResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    conversation_id: UUID
    agent_id: str
    status: str
    iteration_count: int = 0
    tool_calls_count: int = 0
    token_usage: dict | None = None
    timeline: list[dict[str, Any]] = []
    error_message: str | None = None
    started_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class ToolPermissionResponse(BaseModel):
    id: UUID
    tool_id: str
    permission: str
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolPermissionUpdate(BaseModel):
    permission: str  # 'allowed', 'hitl', 'blocked', 'default'
