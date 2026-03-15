"""Knowledge domain schemas.

Keep the domain package aligned with the active knowledge contracts rather than
maintaining a parallel placeholder schema set.
"""

from pydantic import BaseModel

from openforge.schemas.knowledge import (
    KnowledgeCreate,
    KnowledgeListItem,
    KnowledgeListParams,
    KnowledgeResponse,
    KnowledgeTagsUpdate,
    KnowledgeUpdate,
)


class KnowledgeListResponse(BaseModel):
    knowledge: list[KnowledgeListItem]
    total: int
    page: int = 1
    page_size: int = 50


__all__ = [
    "KnowledgeCreate",
    "KnowledgeListItem",
    "KnowledgeListParams",
    "KnowledgeListResponse",
    "KnowledgeResponse",
    "KnowledgeTagsUpdate",
    "KnowledgeUpdate",
]
