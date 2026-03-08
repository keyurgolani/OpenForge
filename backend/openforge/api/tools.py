"""
Tool management API endpoints.

Endpoints for managing built-in tool definitions and external MCP servers.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import httpx
import logging

from openforge.db.postgres import get_db
from openforge.db.models import ToolDefinition
from openforge.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


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


# ── Skills endpoints (alias for tools) ──
skills_router = APIRouter(prefix="/skills", tags=["skills"])


@skills_router.get("")
async def list_skills(db: AsyncSession = Depends(get_db)):
    """List all available skills."""
    query = select(ToolDefinition).where(ToolDefinition.is_enabled == True)
    query = query.order_by(ToolDefinition.category, ToolDefinition.id)

    result = await db.execute(query)
    tools = result.scalars().all()

    return [
        {
            "id": t.id,
            "category": t.category,
            "display_name": t.display_name,
            "description": t.description,
            "input_schema": t.input_schema,
            "risk_level": t.risk_level,
            "is_enabled": t.is_enabled,
        }
        for t in tools
    ]


@skills_router.post("/install")
async def install_skill(request_body: dict):
    """Install a skill from a source."""
    # For now, this is a placeholder that syncs tools
    # In the future, this could support installing from URLs or packages
    from openforge.services.tool_sync import sync_tools_from_server

    source = request_body.get("source")
    if not source:
        raise HTTPException(400, "source field is required")

    try:
        synced = await sync_tools_from_server()
        return {
            "success": True,
            "message": f"Skill installed successfully (synced {synced} tool definitions)",
        }
    except httpx.HTTPError as e:
        logger.error(f"Failed to install skill: {e}")
        raise HTTPException(503, f"Failed to install skill: {e}")
