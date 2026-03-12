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
    agent_name: str | None = None
    workspace_name: str | None = None
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


class AgentTriggerRequest(BaseModel):
    instruction: str
    workspace_id: UUID


class AgentMemoryStoreRequest(BaseModel):
    workspace_id: UUID
    agent_id: str | None = None
    content: str
    memory_type: str = "observation"
    confidence: float = 1.0


class AgentMemoryRecallRequest(BaseModel):
    workspace_id: UUID
    query: str
    limit: int = 5
    agent_id: str | None = None


class AgentMemoryForgetRequest(BaseModel):
    memory_id: UUID


class AgentScheduleCreate(BaseModel):
    agent_id: str
    name: str
    instruction: str
    cron_expression: str
    is_enabled: bool = True


class AgentScheduleUpdate(BaseModel):
    name: str | None = None
    instruction: str | None = None
    cron_expression: str | None = None
    is_enabled: bool | None = None


class AgentScheduleResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    agent_id: str
    name: str
    instruction: str
    cron_expression: str
    is_enabled: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    run_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContinuousTargetResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    knowledge_id: UUID | None = None
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TargetUpdateRequest(BaseModel):
    content: str
    mode: str = "replace"
    agent_id: str | None = None


class ToolPermissionResponse(BaseModel):
    id: UUID
    tool_id: str
    permission: str
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolPermissionUpdate(BaseModel):
    permission: str  # 'allowed', 'hitl', 'blocked', 'default'
