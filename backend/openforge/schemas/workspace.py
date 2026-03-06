from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime
import re


class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    llm_provider_id: Optional[UUID] = None
    llm_model: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Workspace name cannot be empty")
        if len(v) > 200:
            raise ValueError("Workspace name cannot exceed 200 characters")
        return v.strip()

    @field_validator("color")
    @classmethod
    def valid_hex_color(cls, v):
        if v and not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("Color must be a valid hex color (e.g. #2dd4bf)")
        return v


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    llm_provider_id: Optional[UUID] = None
    llm_model: Optional[str] = None
    sort_order: Optional[int] = None


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    llm_provider_id: Optional[UUID] = None
    llm_model: Optional[str] = None
    sort_order: int
    note_count: int = 0
    knowledge_count: int = 0
    conversation_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
