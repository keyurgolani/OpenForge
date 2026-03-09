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
from openforge.api import skills
from openforge.api import tools as tools_api
from openforge.api import mcp as mcp_api

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
api_router.include_router(skills.router, prefix="/skills", tags=["skills"])
api_router.include_router(tools_api.router, prefix="/tools", tags=["tools"])
api_router.include_router(mcp_api.router, prefix="/mcp", tags=["mcp"])
