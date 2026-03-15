"""Prompt domain types and rendering exceptions."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PromptType(StrEnum):
    SYSTEM = "system"
    TASK = "task"
    ROUTER = "router"
    SUMMARY = "summary"
    APPROVAL = "approval"
    TOOL_CONTEXT = "tool_context"
    ERROR_RECOVERY = "error_recovery"
    MISSION_BOOTSTRAP = "mission_bootstrap"
    WORKFLOW_NODE = "workflow_node"


class PromptTemplateFormat(StrEnum):
    FORMAT_STRING = "format_string"


class PromptFallbackBehavior(StrEnum):
    ERROR = "error"
    USE_DECLARED_FALLBACK = "use_declared_fallback"


class PromptOwnerType(StrEnum):
    SYSTEM = "system"
    PROFILE = "profile"
    WORKFLOW = "workflow"
    MISSION = "mission"
    UTILITY = "utility"


class PromptStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class PromptVariableDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str = Field(default="string")
    required: bool = Field(default=True)
    description: str | None = None


class PromptRenderMetadata(BaseModel):
    prompt_id: str
    prompt_version: int
    owner_type: str
    owner_id: str | None = None
    rendered_at: datetime
    variable_keys: list[str]


class RenderedPrompt(BaseModel):
    content: str
    metadata: PromptRenderMetadata


class PromptRenderError(Exception):
    def __init__(self, reason_code: str, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.reason_code = reason_code
        self.details = details or {}


class PromptRenderValidationError(PromptRenderError):
    """Typed render error for invalid prompt input."""
