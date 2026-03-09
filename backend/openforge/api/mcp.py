"""MCP Server management API."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import uuid

from openforge.db.postgres import get_db
from openforge.services import mcp_service

router = APIRouter()


class MCPServerCreate(BaseModel):
    name: str
    url: str
    description: Optional[str] = None
    transport: str = "http"          # "http" or "sse"
    auth_type: str = "none"          # "none", "bearer", "api_key", "header"
    auth_value: Optional[str] = None
    is_enabled: bool = True
    default_risk_level: str = "high"


class MCPServerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    transport: Optional[str] = None
    auth_type: Optional[str] = None
    auth_value: Optional[str] = None
    is_enabled: Optional[bool] = None
    default_risk_level: Optional[str] = None


class MCPToolOverrideUpdate(BaseModel):
    risk_level: Optional[str] = None
    is_enabled: Optional[bool] = None


def _serialize(server) -> dict:
    return {
        "id": str(server.id),
        "name": server.name,
        "url": server.url,
        "description": server.description,
        "transport": server.transport,
        "auth_type": server.auth_type,
        "has_auth": server.auth_value_enc is not None,
        "is_enabled": server.is_enabled,
        "discovered_tools": server.discovered_tools or [],
        "tool_count": len(server.discovered_tools or []),
        "last_discovered_at": server.last_discovered_at.isoformat() if server.last_discovered_at else None,
        "default_risk_level": server.default_risk_level,
        "created_at": server.created_at.isoformat(),
        "updated_at": server.updated_at.isoformat(),
    }


@router.get("/servers")
async def list_servers(db: AsyncSession = Depends(get_db)):
    servers = await mcp_service.list_servers(db)
    return {"servers": [_serialize(s) for s in servers]}


@router.post("/servers", status_code=201)
async def create_server(body: MCPServerCreate, db: AsyncSession = Depends(get_db)):
    server = await mcp_service.create_server(db, body.model_dump())
    return _serialize(server)


@router.get("/servers/{server_id}")
async def get_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await mcp_service.get_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return _serialize(server)


@router.put("/servers/{server_id}")
async def update_server(
    server_id: uuid.UUID, body: MCPServerUpdate, db: AsyncSession = Depends(get_db)
):
    server = await mcp_service.get_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    server = await mcp_service.update_server(db, server, body.model_dump(exclude_none=True))
    return _serialize(server)


@router.delete("/servers/{server_id}", status_code=204)
async def delete_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await mcp_service.get_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    await mcp_service.delete_server(db, server)


@router.post("/servers/{server_id}/discover")
async def discover_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await mcp_service.get_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    try:
        server = await mcp_service.rediscover_server(db, server)
        return _serialize(server)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Discovery failed: {exc}")


@router.put("/servers/{server_id}/tools/{tool_name}")
async def update_tool_override(
    server_id: uuid.UUID,
    tool_name: str,
    body: MCPToolOverrideUpdate,
    db: AsyncSession = Depends(get_db),
):
    server = await mcp_service.get_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    override = await mcp_service.upsert_tool_override(
        db, server, tool_name, body.risk_level, body.is_enabled
    )
    return {
        "id": str(override.id),
        "mcp_server_id": str(override.mcp_server_id),
        "tool_name": override.tool_name,
        "risk_level": override.risk_level,
        "is_enabled": override.is_enabled,
    }
