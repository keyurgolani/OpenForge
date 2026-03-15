"""
OpenForge API Router

Mounts non-domain API routes.
Removed architecture-first product routes stay removed; this file contains
runtime/common/integration routers that have not yet moved into final owners.
"""

from fastapi import APIRouter

# Runtime/common/integration routers pending later ownership moves.
from openforge.api import settings as settings_module
from openforge.api import llm as llm_api
from openforge.api import workspaces
from openforge.api import knowledge
from openforge.api import knowledge_upload
from openforge.api import conversations
from openforge.api import search
from openforge.api import visual_search
from openforge.api import tasks
from openforge.api import attachments
from openforge.api import mcp as mcp_api
from openforge.api import export as export_api
from openforge.api import models as models_api
from openforge.api import tool_server as tool_server_api
from openforge.domains.policies.router import router as policies_router
from openforge.domains.prompts.router import router as prompts_router
from openforge.domains.retrieval.router import router as retrieval_router

# Domain routers (new architecture)
api_router = APIRouter(prefix="/api/v1")

# Runtime/common/integration routes
api_router.include_router(settings_module.router, prefix="/settings", tags=["settings"])
api_router.include_router(settings_module.onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(llm_api.router, prefix="/llm", tags=["llm"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(knowledge.router, prefix="/workspaces", tags=["knowledge"])
api_router.include_router(knowledge.knowledge_global_router, tags=["knowledge"])
api_router.include_router(knowledge_upload.router, prefix="/workspaces", tags=["knowledge-upload"])
api_router.include_router(conversations.router, prefix="/workspaces", tags=["conversations"])
api_router.include_router(search.router, prefix="/workspaces", tags=["search"])
api_router.include_router(visual_search.router, prefix="/workspaces", tags=["visual-search"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])
api_router.include_router(mcp_api.router, prefix="/mcp", tags=["mcp"])
api_router.include_router(export_api.router, prefix="/export", tags=["export"])
api_router.include_router(models_api.router, prefix="/models", tags=["models"])
api_router.include_router(tool_server_api.router, tags=["tool-server"])
api_router.include_router(prompts_router, prefix="/prompts", tags=["prompts"])
api_router.include_router(policies_router, prefix="/policies", tags=["policies"])
api_router.include_router(retrieval_router, prefix="/retrieval", tags=["retrieval"])

# Domain routes (new architecture)
