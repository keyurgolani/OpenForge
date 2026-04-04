"""Agent definition domain API schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LlmConfigSchema(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2000
    allow_override: bool = True


class ToolConfigSchema(BaseModel):
    name: str
    category: str
    mode: str = Field(default="allowed", pattern="^(allowed|hitl)$")


class MemoryConfigSchema(BaseModel):
    history_limit: int = 20
    attachment_support: bool = True
    auto_bookmark_urls: bool = True


class ParameterConfigSchema(BaseModel):
    name: str
    type: str = Field(default="text", pattern="^(text|enum|number|boolean)$")
    label: Optional[str] = None
    description: Optional[str] = None
    required: bool = True
    default: Any = None
    options: list[str] = Field(default_factory=list)


class OutputDefinitionSchema(BaseModel):
    key: str
    type: str = Field(default="text", pattern="^(text|json|number|boolean)$")
    label: Optional[str] = None
    description: Optional[str] = None
    schema_def: Optional[dict[str, Any]] = Field(default=None, alias="schema")


class AgentDefinitionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    icon: Optional[str] = Field(default=None, max_length=100)
    tags: list[str] = Field(default_factory=list)
    mode: str = Field(default="interactive", pattern="^(interactive|pipeline)$")
    system_prompt: str = ""
    llm_config: LlmConfigSchema = Field(default_factory=LlmConfigSchema)
    tools_config: list[ToolConfigSchema] = Field(default_factory=list)
    memory_config: MemoryConfigSchema = Field(default_factory=MemoryConfigSchema)
    parameters: list[ParameterConfigSchema] = Field(default_factory=list)
    output_definitions: list[OutputDefinitionSchema] = Field(default_factory=list)


class AgentDefinitionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    icon: Optional[str] = Field(default=None, max_length=100)
    tags: Optional[list[str]] = None
    mode: Optional[str] = Field(default=None, pattern="^(interactive|pipeline)$")
    system_prompt: Optional[str] = None
    llm_config: Optional[LlmConfigSchema] = None
    tools_config: Optional[list[ToolConfigSchema]] = None
    memory_config: Optional[MemoryConfigSchema] = None
    parameters: Optional[list[ParameterConfigSchema]] = None
    output_definitions: Optional[list[OutputDefinitionSchema]] = None


class AgentDefinitionResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    icon: Optional[str]
    tags: list[str] = Field(default_factory=list)
    mode: str = "interactive"
    system_prompt: str
    llm_config: dict[str, Any] = Field(default_factory=dict)
    tools_config: list[dict[str, Any]] = Field(default_factory=list)
    memory_config: dict[str, Any] = Field(default_factory=dict)
    parameters: list[dict[str, Any]] = Field(default_factory=list)
    output_definitions: list[dict[str, Any]] = Field(default_factory=list)
    active_version_id: Optional[UUID]
    input_schema: list[dict[str, Any]] = Field(default_factory=list)
    is_parameterized: bool = False
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class AgentDefinitionListResponse(BaseModel):
    agents: list[AgentDefinitionResponse]
    total: int


class AgentDefinitionVersionResponse(BaseModel):
    id: UUID
    agent_id: UUID
    version: int
    snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class AgentDefinitionVersionListResponse(BaseModel):
    versions: list[AgentDefinitionVersionResponse]
    total: int
