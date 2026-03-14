"""
OpenForge API Router

Mounts all API routes and domain routers.
Legacy routes (agents, agent_schedules, targets) have been removed.
Use domain routes (/api/v1/profiles, /api/v1/triggers, /api/v1/artifacts) instead.
"""

from fastapi import APIRouter

# Legacy API modules (transitional - will be thinned)
from openforge.api import settings as settings_module
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
from openforge.api import hitl as hitl_api
from openforge.api import tool_permissions as tool_permissions_api
from openforge.api import models as models_api

# Domain routers (new architecture)
from openforge.domains.profiles.router import router as profiles_router
from openforge.domains.workflows.router import router as workflows_router
from openforge.domains.missions.router import router as missions_router
from openforge.domains.triggers.router import router as triggers_router
from openforge.domains.runs.router import router as runs_router
from openforge.domains.artifacts.router import router as artifacts_router

api_router = APIRouter(prefix="/api/v1")

# Legacy routes (transitional)
api_router.include_router(settings_module.router, prefix="/settings", tags=["settings"])
api_router.include_router(settings_module.onboarding_router, prefix="/onboarding", tags=["onboarding"])
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
api_router.include_router(hitl_api.router, prefix="/hitl", tags=["hitl"])
api_router.include_router(tool_permissions_api.router, prefix="/tools", tags=["tool-permissions"])
api_router.include_router(models_api.router, prefix="/models", tags=["models"])

# Domain routes (new architecture)
api_router.include_router(profiles_router, prefix="/profiles", tags=["profiles"])
api_router.include_router(workflows_router, prefix="/workflows", tags=["workflows"])
api_router.include_router(missions_router, prefix="/missions", tags=["missions"])
api_router.include_router(triggers_router, prefix="/triggers", tags=["triggers"])
api_router.include_router(runs_router, prefix="/runs", tags=["runs"])
api_router.include_router(artifacts_router, prefix="/artifacts", tags=["artifacts"])
