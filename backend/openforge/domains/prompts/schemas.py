"""Prompt API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .types import (
    PromptFallbackBehavior,
    PromptOwnerType,
    PromptStatus,
    PromptTemplateFormat,
    PromptType,
    PromptVariableDefinition,
)


class PromptBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    prompt_type: PromptType
    template: str = Field(..., min_length=1)
    template_format: PromptTemplateFormat = Field(default=PromptTemplateFormat.FORMAT_STRING)
    variable_schema: dict[str, PromptVariableDefinition] = Field(default_factory=dict)
    fallback_behavior: PromptFallbackBehavior = Field(default=PromptFallbackBehavior.ERROR)
    owner_type: PromptOwnerType = Field(default=PromptOwnerType.SYSTEM)
    owner_id: str | None = Field(default=None, max_length=255)
    is_system: bool = False
    is_template: bool = False
    status: PromptStatus = Field(default=PromptStatus.ACTIVE)


class PromptCreate(PromptBase):
    created_by: UUID | None = None


class PromptUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    prompt_type: PromptType | None = None
    template: str | None = Field(default=None, min_length=1)
    template_format: PromptTemplateFormat | None = None
    variable_schema: dict[str, PromptVariableDefinition] | None = None
    fallback_behavior: PromptFallbackBehavior | None = None
    owner_type: PromptOwnerType | None = None
    owner_id: str | None = Field(default=None, max_length=255)
    is_system: bool | None = None
    is_template: bool | None = None
    status: PromptStatus | None = None
    updated_by: UUID | None = None


class PromptResponse(PromptBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None
    last_used_at: datetime | None = None


class PromptVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prompt_definition_id: UUID
    version: int
    template: str
    template_format: PromptTemplateFormat
    variable_schema: dict[str, PromptVariableDefinition]
    status: PromptStatus
    created_at: datetime | None = None
    created_by: UUID | None = None


class PromptListResponse(BaseModel):
    prompts: list[PromptResponse]
    total: int


class PromptPreviewRequest(BaseModel):
    version: int | None = None
    variables: dict[str, Any] = Field(default_factory=dict)


class PromptPreviewResponse(BaseModel):
    content: str
    metadata: dict[str, Any]
    validation_errors: list[dict[str, Any]] = Field(default_factory=list)
