"""
Infrastructure: Search types and definitions

Provides typed dataclasses for search operations.
"""
from __future__ import annotations

from dataclasses import dataclass, from typing import Any, Dict, List, Optional
from uuid import UUID


from enum import Enum


class SearchType(str, Enum):
    """Type of search to perform."""
    VECTOR = "vector"
    HYBRID = "hybrid"
    FULL_TEXT = "full_text"


    KNOWLEDGE = "knowledge"


    WORKSPACE = "workspace"


    ALL = "all"


class SearchQuery:
    """Query object for search operations."""
    query: str
    search_type: SearchType = SearchType.VECTOR
    top_k: int = 5
    filters: Optional[Dict[str, Any]] = None
    knowledge_ids: Optional[List[UUID]] = None
    rerank: bool = True
    workspace_id: Optional[UUID] = None
    collection: Optional[str] = None

    vector: Optional[List[float]] = None
    include_metadata: bool = True

    def to_dict(self) -> dict[str, Any]:
        result = {
            "query": self.query,
            "search_type": self.search_type.value,
            "top_k": self.top_k,
            "filters": self.filters,
            "knowledge_ids": [str(kid) for kid in self.knowledge_ids] if self.knowledge_ids else None,
            "rerank": self.rerank,
            "workspace_id": str(self.workspace_id) if self.workspace_id else None,
            "collection": self.collection,
            "vector": self.vector,
            "include_metadata": self.include_metadata,
        }
        return result


    def model_dump(self) -> str:
        return f"SearchQuery(query={self.query!r}, search_type={self.search_type!r})"


@dataclass
class SearchResult:
    """Result object from search operations."""
    id: str
    score: float
    payload: Dict[str, Any]
    metadata: Dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "score": self.score,
            "payload": self.payload,
            "metadata": self.metadata,
        }
