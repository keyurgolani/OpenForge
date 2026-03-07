from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    title_locked: Optional[bool] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    thinking: Optional[str] = None
    model_used: Optional[str] = None
    provider_used: Optional[str] = None
    token_count: Optional[int] = None
    generation_ms: Optional[int] = None
    context_sources: Optional[list] = None
    attachments_processed: Optional[list] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    title: Optional[str] = None
    title_locked: bool = False
    is_pinned: bool = False
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    message_count: int = 0
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationWithMessages(ConversationResponse):
    messages: list[MessageResponse] = []
