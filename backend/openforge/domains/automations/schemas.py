"""Automation domain API schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AutomationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: str = Field(default="draft", max_length=50)
    icon: Optional[str] = Field(default=None, max_length=100)
    is_template: bool = False
    is_system: bool = False
    tags: list[str] = Field(default_factory=list)


class AutomationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[str] = Field(default=None, max_length=50)
    icon: Optional[str] = Field(default=None, max_length=100)
    is_template: Optional[bool] = None
    is_system: Optional[bool] = None
    tags: Optional[list[str]] = None


class AutomationResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    active_spec_id: Optional[UUID]
    graph_version: int = 0
    status: str
    icon: Optional[str]
    is_template: bool
    is_system: bool
    tags: list[str] = Field(default_factory=list)
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]
    last_failure_at: Optional[datetime]
    last_triggered_at: Optional[datetime]
    health_status: str
    last_error_summary: Optional[str]
    compilation_status: str
    compilation_error: Optional[str]
    last_compiled_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    graph_preview: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class AutomationListResponse(BaseModel):
    automations: list[AutomationResponse]
    total: int


class AutomationCompileResponse(BaseModel):
    automation_id: UUID
    spec_id: Optional[UUID] = None
    version: int = 0
    compilation_status: str
    compilation_error: Optional[str] = None


class AutomationRunRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)
    workspace_id: UUID


class AutomationRunResponse(BaseModel):
    run_id: UUID
    automation_id: UUID
    status: str


# Graph schemas
class GraphNodeInput(BaseModel):
    node_key: str
    node_type: str = "agent"
    agent_id: Optional[UUID] = None
    sink_type: Optional[str] = None
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    config: dict[str, Any] = Field(default_factory=dict)


class GraphEdgeInput(BaseModel):
    source_node_key: str
    source_output_key: str = "output"
    target_node_key: str
    target_input_key: str


class GraphStaticInput(BaseModel):
    node_key: str
    input_key: str
    static_value: Any = None


class SaveGraphRequest(BaseModel):
    nodes: list[GraphNodeInput]
    edges: list[GraphEdgeInput] = Field(default_factory=list)
    static_inputs: list[GraphStaticInput] = Field(default_factory=list)
