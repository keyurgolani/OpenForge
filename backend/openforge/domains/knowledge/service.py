"""Knowledge domain service facade.

The canonical implementation already lives in the shared knowledge service
layer. Re-export it from the domain package so knowledge work can depend on
the domain path instead of the legacy service location.
"""

from openforge.services.knowledge_service import (
    KnowledgeService,
    knowledge_service,
)

__all__ = ["KnowledgeService", "knowledge_service"]
