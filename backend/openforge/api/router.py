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
from openforge.api import conversations
from openforge.api import search
from openforge.api import visual_search
from openforge.api import tasks
from openforge.api import attachments
from openforge.api import mcp as mcp_api
from openforge.api import export as export_api
from openforge.api import import_api
from openforge.api import models as models_api
from openforge.api import tts as tts_api
from openforge.api import tool_server as tool_server_api
from openforge.api import runtime as runtime_api
from openforge.api import hitl as hitl_api
from openforge.api import global_chat as global_chat_api

# Domain routers (new architecture)
api_router = APIRouter(prefix="/api/v1")

# Runtime/common/integration routes
api_router.include_router(settings_module.router, prefix="/settings", tags=["settings"])
api_router.include_router(settings_module.onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(llm_api.router, prefix="/llm", tags=["llm"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(conversations.router, prefix="/workspaces", tags=["conversations"])
api_router.include_router(search.router, prefix="/workspaces", tags=["search"])
api_router.include_router(visual_search.router, prefix="/workspaces", tags=["visual-search"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])
api_router.include_router(mcp_api.router, prefix="/mcp", tags=["mcp"])
api_router.include_router(export_api.router, prefix="/export", tags=["export"])
api_router.include_router(import_api.router, prefix="/import", tags=["import"])
api_router.include_router(models_api.router, prefix="/models", tags=["models"])
api_router.include_router(tts_api.router, prefix="/models/tts", tags=["tts"])
api_router.include_router(tool_server_api.router, tags=["tool-server"])
api_router.include_router(runtime_api.router, prefix="/runtime", tags=["runtime"])
api_router.include_router(hitl_api.router, prefix="/policies", tags=["hitl"])
api_router.include_router(global_chat_api.router, prefix="/chat", tags=["global-chat"])


# System-provided prompt variables — auto-populated at runtime
SYSTEM_VARIABLES = [
    {"name": "system.agent_name", "description": "This agent's name", "category": "agent"},
    {"name": "system.agent_description", "description": "This agent's description", "category": "agent"},
    {"name": "system.agent_slug", "description": "This agent's slug identifier", "category": "agent"},
    {"name": "system.timestamp", "description": "Current UTC timestamp (ISO 8601)", "category": "context"},
    {"name": "system.date", "description": "Current UTC date (YYYY-MM-DD)", "category": "context"},
    {
        "name": "system.workspaces", "category": "knowledge",
        "description": "List of workspaces — iterate with {% for ws in system.workspaces %}",
        "children": [
            {"name": "id", "description": "Workspace UUID"},
            {"name": "name", "description": "Workspace name"},
            {"name": "description", "description": "Workspace description"},
            {"name": "knowledge_count", "description": "Number of knowledge items"},
        ],
    },
    {
        "name": "system.tools", "category": "tools",
        "description": "List of tools — use contains(system.tools, \"tool.id\") to check availability",
        "children": [
            {"name": "id", "description": "Tool identifier (e.g. agent.invoke)"},
            {"name": "name", "description": "Tool display name"},
            {"name": "description", "description": "Tool description"},
            {"name": "category", "description": "Tool category (e.g. agent, filesystem)"},
        ],
    },
    {
        "name": "system.skills", "category": "tools",
        "description": "List of installed skills — iterate with {% for sk in system.skills %}",
        "children": [
            {"name": "id", "description": "Skill identifier"},
            {"name": "name", "description": "Skill name"},
            {"name": "description", "description": "Skill description"},
        ],
    },
    {
        "name": "system.agents", "category": "agents",
        "description": "List of available agents — iterate with {% for ag in system.agents %}",
        "children": [
            {"name": "id", "description": "Agent UUID"},
            {"name": "slug", "description": "Agent slug identifier"},
            {"name": "name", "description": "Agent display name"},
            {"name": "description", "description": "Agent description"},
            {"name": "tags", "description": "Agent tags (list of strings)"},
        ],
    },
    {
        "name": "system.output_definitions", "category": "output",
        "description": "List of this agent's output definitions — iterate with {% for out in system.output_definitions %}",
        "children": [
            {"name": "key", "description": "Output variable key"},
            {"name": "type", "description": "Output type (text, json, number, boolean)"},
            {"name": "label", "description": "Output display label"},
            {"name": "description", "description": "Output description"},
        ],
    },
    {
        "name": "system.input_schema", "category": "input",
        "description": "List of this agent's input parameters — iterate with {% for p in system.input_schema %}",
        "children": [
            {"name": "name", "description": "Parameter name"},
            {"name": "type", "description": "Parameter type (text, enum, number, boolean)"},
            {"name": "required", "description": "Whether the parameter is required"},
            {"name": "description", "description": "Parameter description"},
        ],
    },
]


# Template engine reference endpoint
@api_router.get("/template-engine/reference", tags=["template-engine"])
async def get_template_reference():
    """Return template engine reference data for editor autocomplete."""
    from openforge.runtime.template_engine import function_catalog

    return {
        "functions": function_catalog(),
        "types": ["text", "textarea", "number", "boolean", "enum"],
        "syntax": [
            {"name": "variable", "pattern": "{{name}}", "description": "Insert a variable value"},
            {"name": "typed_variable", "pattern": "{{name::type}}", "description": "Variable with type hint"},
            {"name": "enum_variable", "pattern": "{{name::[opt1, opt2]}}", "description": "Variable with enum options"},
            {"name": "conditional", "pattern": "{% if condition %}...{% endif %}", "description": "Conditional block"},
            {"name": "conditional_else", "pattern": "{% if condition %}...{% else %}...{% endif %}", "description": "Conditional with else"},
            {"name": "loop", "pattern": "{% for item in collection %}...{% endfor %}", "description": "Loop over a collection"},
            {"name": "comment", "pattern": "{# comment #}", "description": "Template comment (stripped from output)"},
            {"name": "function", "pattern": "{{functionName(args)}}", "description": "Call a built-in function"},
        ],
        "system_variables": SYSTEM_VARIABLES,
    }


# Domain routes (new architecture)
