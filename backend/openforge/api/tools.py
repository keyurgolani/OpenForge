"""
Tool management API endpoints.

Endpoints for managing built-in tool definitions and external MCP servers.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID
from datetime import datetime
import httpx
import logging

from openforge.db.postgres import get_db
from openforge.db.models import ToolDefinition, ToolExecutionLog
from openforge.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


class SkillInstallRequest(BaseModel):
    source: str


@router.get("")
async def list_tools(
    category: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all tool definitions."""
    query = select(ToolDefinition)

    if category:
        query = query.where(ToolDefinition.category == category)
    if is_enabled is not None:
        query = query.where(ToolDefinition.is_enabled == is_enabled)

    query = query.order_by(ToolDefinition.category, ToolDefinition.id)

    result = await db.execute(query)
    tools = result.scalars().all()

    return {
        "tools": [
            {
                "id": t.id,
                "category": t.category,
                "display_name": t.display_name,
                "description": t.description,
                "input_schema": t.input_schema,
                "risk_level": t.risk_level,
                "requires_workspace_scope": t.requires_workspace_scope,
                "is_enabled": t.is_enabled,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in tools
        ],
        "count": len(tools),
    }


@router.get("/categories")
async def list_tool_categories(db: AsyncSession = Depends(get_db)):
    """List all tool categories with counts."""
    from sqlalchemy import func

    query = select(
        ToolDefinition.category,
        func.count(ToolDefinition.id).label("count")
    ).group_by(ToolDefinition.category).order_by(ToolDefinition.category)

    result = await db.execute(query)
    categories = result.all()

    return {
        "categories": [
            {"name": c.category, "count": c.count}
            for c in categories
        ]
    }


@router.get("/executions")
async def list_tool_executions(
    workspace_id: Optional[UUID] = None,
    tool_id: Optional[str] = None,
    tool_category: Optional[str] = None,
    success: Optional[bool] = None,
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List tool execution audit log entries."""
    query = select(ToolExecutionLog).order_by(desc(ToolExecutionLog.started_at)).limit(limit)
    if workspace_id:
        query = query.where(ToolExecutionLog.workspace_id == workspace_id)
    if tool_id:
        query = query.where(ToolExecutionLog.tool_id == tool_id)
    if tool_category:
        query = query.where(ToolExecutionLog.tool_category == tool_category)
    if success is not None:
        query = query.where(ToolExecutionLog.success == success)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "workspace_id": str(log.workspace_id) if log.workspace_id else None,
            "conversation_id": str(log.conversation_id) if log.conversation_id else None,
            "execution_id": log.execution_id,
            "tool_id": log.tool_id,
            "tool_display_name": log.tool_display_name,
            "tool_category": log.tool_category,
            "input_params": log.input_params,
            "output_summary": log.output_summary,
            "success": log.success,
            "error_message": log.error_message,
            "duration_ms": log.duration_ms,
            "started_at": log.started_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/{tool_id}")
async def get_tool(tool_id: str, db: AsyncSession = Depends(get_db)):
    """Get details for a specific tool."""
    result = await db.execute(
        select(ToolDefinition).where(ToolDefinition.id == tool_id)
    )
    tool = result.scalar_one_or_none()

    if not tool:
        raise HTTPException(404, f"Tool not found: {tool_id}")

    return {
        "id": tool.id,
        "category": tool.category,
        "display_name": tool.display_name,
        "description": tool.description,
        "input_schema": tool.input_schema,
        "output_schema": tool.output_schema,
        "risk_level": tool.risk_level,
        "requires_workspace_scope": tool.requires_workspace_scope,
        "is_enabled": tool.is_enabled,
        "created_at": tool.created_at.isoformat() if tool.created_at else None,
    }


@router.patch("/{tool_id}")
async def update_tool(
    tool_id: str,
    is_enabled: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    """Update tool settings (currently only is_enabled)."""
    result = await db.execute(
        select(ToolDefinition).where(ToolDefinition.id == tool_id)
    )
    tool = result.scalar_one_or_none()

    if not tool:
        raise HTTPException(404, f"Tool not found: {tool_id}")

    if is_enabled is not None:
        tool.is_enabled = is_enabled

    await db.commit()

    return {
        "id": tool.id,
        "is_enabled": tool.is_enabled,
        "message": "Tool updated successfully",
    }


@router.post("/sync")
async def sync_tool_definitions():
    """
    Sync tool definitions from the tool server.

    Fetches all tools from the tool server's /tools/registry endpoint
    and updates the local database.
    """
    from openforge.services.tool_sync import sync_tools_from_server

    try:
        synced = await sync_tools_from_server()
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch tools from server: {e}")
        raise HTTPException(503, f"Failed to connect to tool server: {e}")

    return {
        "synced": synced,
        "message": f"Synced {synced} tool definitions from tool server",
    }


# ── Skills endpoints ──
skills_router = APIRouter(prefix="/skills", tags=["skills"])

_TOOL_SERVER_CONTEXT = {
    "workspace_id": "admin",
    "workspace_path": "/skills",
    "execution_id": "admin",
}


async def _call_tool_server(tool_id: str, params: dict) -> dict:
    """Call a tool on the tool server and return the result."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.tool_server_url}/tools/execute",
            json={"tool_id": tool_id, "params": params, "context": _TOOL_SERVER_CONTEXT},
        )
        response.raise_for_status()
        return response.json()


@skills_router.get("")
async def list_skills():
    """List installed skills from the /skills volume via the tool server."""
    try:
        result = await _call_tool_server("skills.list_skills", {})
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Failed to connect to tool server: {e}")

    if not result.get("success"):
        raise HTTPException(500, result.get("error", "Failed to list skills"))

    return result.get("output", {}).get("skills", [])


@skills_router.post("/install")
async def install_skill(request: SkillInstallRequest):
    """Install a skill from skills.sh using the skills CLI (owner/skill-name format)."""
    source = request.source.strip()
    if not source:
        raise HTTPException(400, "source field cannot be empty")

    try:
        result = await _call_tool_server(
            "skills.install_skill",
            {"skill": source},
        )
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Failed to connect to tool server: {e}")

    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Failed to install skill"))

    output = result.get("output", {})
    installed = output.get("installed_files", [])
    names = ", ".join(f["name"] for f in installed) if installed else source
    return {
        "success": True,
        "message": f"Skill '{names}' installed successfully ({output.get('file_count', 0)} file(s))",
        "skill": output,
    }
