"""Knowledge domain router.

The knowledge HTTP surface still reuses the proven implementation from the
existing API modules, but ownership now lives under the knowledge domain so
future work can target `openforge.domains.knowledge.*` directly.
"""

from fastapi import APIRouter

from openforge.api import knowledge as knowledge_api
from openforge.api import knowledge_upload as knowledge_upload_api
from openforge.api import journal as journal_api

router = APIRouter()
global_router = APIRouter()

router.include_router(knowledge_api.router)
router.include_router(knowledge_upload_api.router)
router.include_router(journal_api.router)
global_router.include_router(knowledge_api.knowledge_global_router)

__all__ = ["global_router", "router"]
