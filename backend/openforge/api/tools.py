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

from openforge.db.database import get_db
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
async def sync_tool_definitions(db: AsyncSession = Depends(get_db)):
    """
    Sync tool definitions from the tool server.

    Fetches all tools from the tool server's /tools/registry endpoint
    and updates the local database.
    """
    from sqlalchemy.dialects.postgresql import insert

    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{settings.tool_server_url}/tools/registry")
            response.raise_for_status()
            tools = response.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch tools from server: {e}")
        raise HTTPException(503, f"Failed to connect to tool server: {e}")

    synced = 0
    errors = []

    for tool in tools:
        try:
            requires_workspace = tool["category"] in [
                "filesystem", "git", "shell", "language"
            ]

            stmt = insert(ToolDefinition).values(
                id=tool["id"],
                category=tool["category"],
                display_name=tool["display_name"],
                description=tool["description"],
                input_schema=tool["input_schema"],
                output_schema=None,
                risk_level=tool["risk_level"],
                requires_workspace_scope=requires_workspace,
                is_enabled=True,
            ).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "category": tool["category"],
                    "display_name": tool["display_name"],
                    "description": tool["description"],
                    "input_schema": tool["input_schema"],
                    "risk_level": tool["risk_level"],
                    "requires_workspace_scope": requires_workspace,
                }
            )

            await db.execute(stmt)
            synced += 1
        except Exception as e:
            errors.append(f"{tool['id']}: {str(e)}")
            logger.error(f"Failed to sync tool {tool['id']}: {e}")

    await db.commit()

    return {
        "synced": synced,
        "total": len(tools),
        "errors": errors,
        "message": f"Synced {synced}/{len(tools)} tool definitions",
    }
