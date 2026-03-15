"""
Knowledge domain package.

Knowledge - user-provided context and data for AI processing.
"""

from .models import KnowledgeModel
from .router import global_router, router
from .schemas import (
    KnowledgeCreate,
    KnowledgeListItem,
    KnowledgeListParams,
    KnowledgeListResponse,
    KnowledgeResponse,
    KnowledgeTagsUpdate,
    KnowledgeUpdate,
)
from .service import KnowledgeService, knowledge_service
from .types import Knowledge, KnowledgeStatus, KnowledgeType

__all__ = [
    "Knowledge",
    "KnowledgeStatus",
    "KnowledgeType",
    "KnowledgeModel",
    "KnowledgeCreate",
    "KnowledgeListItem",
    "KnowledgeListParams",
    "KnowledgeUpdate",
    "KnowledgeTagsUpdate",
    "KnowledgeResponse",
    "KnowledgeListResponse",
    "KnowledgeService",
    "global_router",
    "knowledge_service",
    "router",
]
