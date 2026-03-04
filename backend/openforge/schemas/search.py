from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal
from uuid import UUID


class SearchResult(BaseModel):
    note_id: UUID
    title: str
    note_type: str
    chunk_text: str
    header_path: Optional[str] = None
    tags: list[str] = []
    score: float
    created_at: Optional[str] = None
    highlighted_text: Optional[str] = None


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total: int


class SearchParams(BaseModel):
    q: str
    mode: Literal["search", "chat"] = "search"
    note_type: Optional[str] = None
    tag: Optional[str] = None
    limit: int = 20
