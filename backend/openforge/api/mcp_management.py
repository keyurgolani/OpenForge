"""
MCP Server Management API endpoints.

Endpoints for configuring and managing external MCP servers.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import uuid

from openforge.db.postgres import get_db
from openforge.services.mcp_service import MCPService, get_mcp_service

router = APIRouter(prefix="/mcp", tags=["mcp"])


class MCPServerCreate(BaseModel):
    """Request to create a new MCP server."""
    name: str
    url: str
    description: Optional[str] = None
    auth_type: str = "none"
    auth_value: Optional[str] = None
    default_risk_level: str = "high"


class MCPServerUpdate(BaseModel):
    """Request to update an MCP server."""
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    auth_type: Optional[str] = None
    auth_value: Optional[str] = None
    default_risk_level: Optional[str] = None
    is_enabled: Optional[bool] = None


class ToolOverrideRequest(BaseModel):
    """Request to set a tool override."""
    risk_level: Optional[str] = None
    is_enabled: Optional[bool] = None


@router.get("/servers")
async def list_mcp_servers(
    include_disabled: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """List all configured MCP servers."""
    service = await get_mcp_service(db)
    servers = await service.list_servers(include_disabled=include_disabled)

    return {
        "servers": [
            {
                "id": str(s.id),
                "name": s.name,
                "url": s.url,
                "description": s.description,
                "auth_type": s.auth_type,
                "default_risk_level": s.default_risk_level,
                "is_enabled": s.is_enabled,
                "tool_count": len(s.discovered_tools) if s.discovered_tools else 0,
                "last_discovered_at": s.last_discovered_at.isoformat() if s.last_discovered_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in servers
        ],
        "count": len(servers),
    }


@router.post("/servers")
async def create_mcp_server(
    request: MCPServerCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a new MCP server configuration."""
    service = await get_mcp_service(db)

    # Validate auth_type
    valid_auth_types = ["none", "bearer", "api_key", "header"]
    if request.auth_type not in valid_auth_types:
        raise HTTPException(400, f"Invalid auth_type. Must be one of: {valid_auth_types}")

    # Validate risk level
    valid_risk_levels = ["low", "medium", "high", "critical"]
    if request.default_risk_level not in valid_risk_levels:
        raise HTTPException(400, f"Invalid default_risk_level. Must be one of: {valid_risk_levels}")

    try:
        server = await service.create_server(
            name=request.name,
            url=request.url,
            description=request.description,
            auth_type=request.auth_type,
            auth_value=request.auth_value,
            default_risk_level=request.default_risk_level,
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to create server: {str(e)}")

    # Auto-discover tools
    await service.discover_tools(str(server.id))

    return {
        "id": str(server.id),
        "name": server.name,
        "message": "MCP server created successfully",
    }


@router.get("/servers/{server_id}")
async def get_mcp_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get details for a specific MCP server."""
    service = await get_mcp_service(db)
    server = await service.get_server(server_id)

    if not server:
        raise HTTPException(404, "MCP server not found")

    return {
        "id": str(server.id),
        "name": server.name,
        "url": server.url,
        "description": server.description,
        "auth_type": server.auth_type,
        "default_risk_level": server.default_risk_level,
        "is_enabled": server.is_enabled,
        "discovered_tools": server.discovered_tools or [],
        "last_discovered_at": server.last_discovered_at.isoformat() if server.last_discovered_at else None,
        "created_at": server.created_at.isoformat() if server.created_at else None,
        "updated_at": server.updated_at.isoformat() if server.updated_at else None,
    }


@router.put("/servers/{server_id}")
async def update_mcp_server(
    server_id: str,
    request: MCPServerUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an MCP server configuration."""
    service = await get_mcp_service(db)

    server = await service.update_server(
        server_id=server_id,
        name=request.name,
        url=request.url,
        description=request.description,
        auth_type=request.auth_type,
        auth_value=request.auth_value,
        default_risk_level=request.default_risk_level,
        is_enabled=request.is_enabled,
    )

    if not server:
        raise HTTPException(404, "MCP server not found")

    return {
        "id": str(server.id),
        "name": server.name,
        "message": "MCP server updated successfully",
    }


@router.delete("/servers/{server_id}")
async def delete_mcp_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete an MCP server configuration."""
    service = await get_mcp_service(db)
    deleted = await service.delete_server(server_id)

    if not deleted:
        raise HTTPException(404, "MCP server not found")

    return {"message": "MCP server deleted successfully"}


@router.post("/servers/{server_id}/discover")
async def discover_mcp_tools(
    server_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Re-discover tools from an MCP server."""
    service = await get_mcp_service(db)
    result = await service.discover_tools(server_id)

    if "error" in result and result.get("tools") == []:
        raise HTTPException(503, f"Failed to discover tools: {result['error']}")

    return {
        "server_id": server_id,
        "discovered_count": result.get("count", 0),
        "tools": result.get("tools", []),
        "message": f"Discovered {result.get('count', 0)} tools",
    }


@router.get("/servers/{server_id}/tools")
async def list_server_tools(
    server_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List tools from a specific MCP server."""
    service = await get_mcp_service(db)
    server = await service.get_server(server_id)

    if not server:
        raise HTTPException(404, "MCP server not found")

    tools = server.discovered_tools or []

    # Get overrides for each tool
    enriched_tools = []
    for tool in tools:
        tool_name = tool.get("name", "unknown")
        override = await service.get_tool_override(server_id, tool_name)

        enriched_tools.append({
            "name": tool_name,
            "description": tool.get("description", ""),
            "input_schema": tool.get("inputSchema", {}),
            "risk_level": override.risk_level if override else server.default_risk_level,
            "is_enabled": override.is_enabled if override else True,
            "has_override": override is not None,
        })

    return {
        "server_id": server_id,
        "server_name": server.name,
        "tools": enriched_tools,
        "count": len(enriched_tools),
    }


@router.put("/servers/{server_id}/tools/{tool_name}")
async def set_tool_override(
    server_id: str,
    tool_name: str,
    request: ToolOverrideRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set risk level or enable/disable override for a specific tool."""
    service = await get_mcp_service(db)
    server = await service.get_server(server_id)

    if not server:
        raise HTTPException(404, "MCP server not found")

    # Validate risk level if provided
    if request.risk_level:
        valid_risk_levels = ["low", "medium", "high", "critical"]
        if request.risk_level not in valid_risk_levels:
            raise HTTPException(400, f"Invalid risk_level. Must be one of: {valid_risk_levels}")

    override = await service.set_tool_override(
        server_id=server_id,
        tool_name=tool_name,
        risk_level=request.risk_level,
        is_enabled=request.is_enabled,
    )

    return {
        "server_id": server_id,
        "tool_name": tool_name,
        "risk_level": override.risk_level,
        "is_enabled": override.is_enabled,
        "message": "Tool override updated successfully",
    }


@router.get("/tools")
async def list_all_mcp_tools(
    db: AsyncSession = Depends(get_db),
):
    """List all available tools from all enabled MCP servers."""
    service = await get_mcp_service(db)
    tools = await service.get_all_tools()

    return {
        "tools": tools,
        "count": len(tools),
    }
