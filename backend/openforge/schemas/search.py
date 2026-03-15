from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal
from uuid import UUID


class SearchResult(BaseModel):
    retrieval_result_id: Optional[UUID] = None
    knowledge_id: Optional[UUID] = None
    conversation_id: Optional[UUID] = None
    title: str
    knowledge_type: str
    chunk_text: str
    header_path: Optional[str] = None
    parent_chunk_text: Optional[str] = None
    tags: list[str] = []
    score: float
    source_type: Optional[str] = None
    strategy: Optional[str] = None
    rank_position: Optional[int] = None
    result_status: Optional[str] = None
    opened: Optional[bool] = None
    selected: Optional[bool] = None
    selection_reason_codes: list[str] = []
    created_at: Optional[str] = None
    highlighted_text: Optional[str] = None


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total: int
    retrieval_query_id: Optional[UUID] = None


class SearchParams(BaseModel):
    q: str
    mode: Literal["search", "chat"] = "search"
    knowledge_type: Optional[str] = None
    tag: Optional[str] = None
    limit: int = 20
