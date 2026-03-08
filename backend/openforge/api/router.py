from fastapi import APIRouter
from openforge.api import settings as settings_module
from openforge.api import llm_management
from openforge.api import workspaces
from openforge.api import knowledge
from openforge.api import conversations
from openforge.api import search
from openforge.api import prompts
from openforge.api import tasks
from openforge.api import attachments
from openforge.api import tools
from openforge.api import mcp_management
from openforge.api import hitl
from openforge.api import knowledge_upload
from openforge.api import llm_virtual_providers
from openforge.api import agents
from openforge.api import visual_search

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(settings_module.router, prefix="/settings", tags=["settings"])
api_router.include_router(settings_module.onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(llm_management.router, prefix="/llm", tags=["llm"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(knowledge.router, prefix="/workspaces", tags=["knowledge"])
api_router.include_router(conversations.router, prefix="/workspaces", tags=["conversations"])
api_router.include_router(search.router, prefix="/workspaces", tags=["search"])
api_router.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])
api_router.include_router(tools.router, tags=["tools"])
api_router.include_router(tools.skills_router, tags=["skills"])
api_router.include_router(mcp_management.router, tags=["mcp"])
api_router.include_router(hitl.router, tags=["hitl"])
api_router.include_router(knowledge_upload.router, tags=["knowledge-upload"])
api_router.include_router(llm_virtual_providers.router, tags=["llm-virtual-providers"])
api_router.include_router(agents.router, tags=["agents"])
api_router.include_router(visual_search.router, prefix="/workspaces", tags=["visual-search"])
