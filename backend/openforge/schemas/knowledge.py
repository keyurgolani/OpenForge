from pydantic import BaseModel, ConfigDict
from typing import Optional, Any, Literal
from uuid import UUID
from datetime import datetime


class KnowledgeCreate(BaseModel):
    type: Literal["standard", "fleeting", "bookmark", "gist"] = "standard"
    title: Optional[str] = None
    content: Optional[str] = ""
    url: Optional[str] = None
    gist_language: Optional[str] = None


class KnowledgeUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None
    gist_language: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class KnowledgeTagsUpdate(BaseModel):
    tags: list[str]


class KnowledgeListItem(BaseModel):
    id: UUID
    workspace_id: UUID
    type: str
    title: Optional[str] = None
    content_preview: str = ""
    tags: list[str] = []
    is_pinned: bool = False
    is_archived: bool = False
    word_count: int = 0
    embedding_status: str = "pending"
    insights: Optional[Any] = None
    insights_count: Optional[int] = None
    ai_title: Optional[str] = None
    url: Optional[str] = None
    url_title: Optional[str] = None
    gist_language: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    type: str
    title: Optional[str] = None
    content: str = ""
    url: Optional[str] = None
    url_title: Optional[str] = None
    url_description: Optional[str] = None
    gist_language: Optional[str] = None
    is_pinned: bool = False
    is_archived: bool = False
    insights: Optional[Any] = None
    ai_title: Optional[str] = None
    ai_summary: Optional[str] = None
    embedding_status: str = "pending"
    word_count: int = 0
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeListParams(BaseModel):
    type: Optional[str] = None
    tag: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: bool = False
    sort_by: str = "updated_at"
    sort_order: str = "desc"
    page: int = 1
    page_size: int = 50
