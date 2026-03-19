"""Agent domain API schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    blueprint_md: Optional[str] = None
    mode: str = Field(default="interactive", max_length=50)
    status: str = Field(default="draft", max_length=50)
    icon: Optional[str] = Field(default=None, max_length=100)
    is_template: bool = False
    is_system: bool = False
    tags: list[str] = Field(default_factory=list)


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    blueprint_md: Optional[str] = None
    mode: Optional[str] = Field(default=None, max_length=50)
    status: Optional[str] = Field(default=None, max_length=50)
    icon: Optional[str] = Field(default=None, max_length=100)
    is_template: Optional[bool] = None
    is_system: Optional[bool] = None
    tags: Optional[list[str]] = None


class AgentResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    blueprint_md: str
    active_spec_id: Optional[UUID]
    profile_id: Optional[UUID]
    mode: str
    status: str
    icon: Optional[str]
    is_template: bool
    is_system: bool
    tags: list[str] = Field(default_factory=list)
    last_used_at: Optional[datetime]
    last_error_at: Optional[datetime]
    health_status: str
    last_error_summary: Optional[str]
    compilation_status: str
    compilation_error: Optional[str]
    last_compiled_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int


class AgentCompileResponse(BaseModel):
    agent_id: UUID
    spec_id: UUID
    version: int
    compilation_status: str
    compilation_error: Optional[str] = None


class AgentTemplateCloneRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)


class CompiledSpecResponse(BaseModel):
    id: UUID
    agent_id: UUID
    version: int
    blueprint_snapshot: dict[str, Any] = Field(default_factory=dict)
    resolved_config: dict[str, Any] = Field(default_factory=dict)
    profile_id: Optional[UUID]
    source_md_hash: str
    compiler_version: str
    is_valid: bool
    validation_errors: list[Any] = Field(default_factory=list)
    created_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class CompiledSpecListResponse(BaseModel):
    specs: list[CompiledSpecResponse]
    total: int
