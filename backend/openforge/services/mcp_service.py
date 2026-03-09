"""MCP Server management service — CRUD + tool discovery + tool execution."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from openforge.db.models import MCPServer, MCPToolOverride
from openforge.utils.crypto import encrypt_value, decrypt_value

logger = logging.getLogger("openforge.mcp_service")


def _build_auth_headers(server: MCPServer) -> dict:
    if server.auth_type == "none" or not server.auth_value_enc:
        return {}
    try:
        value = decrypt_value(server.auth_value_enc)
    except Exception:
        return {}

    if server.auth_type == "bearer":
        return {"Authorization": f"Bearer {value}"}
    if server.auth_type == "api_key":
        return {"X-API-Key": value}
    if server.auth_type == "header":
        # Expected format: "Header-Name: value"
        if ":" in value:
            name, val = value.split(":", 1)
            return {name.strip(): val.strip()}
    return {}


async def _open_session(server: MCPServer):
    """Async context manager: yields an initialized MCP ClientSession."""
    from mcp import ClientSession

    headers = _build_auth_headers(server)

    if server.transport == "sse":
        from mcp.client.sse import sse_client

        return sse_client(server.url, headers=headers)

    # Default: HTTP Streamable (newer MCP spec)
    from mcp.client.streamable_http import streamablehttp_client

    return streamablehttp_client(server.url, headers=headers)


async def discover_tools(server: MCPServer) -> list[dict]:
    """Connect to MCP server and retrieve its tool list."""
    from mcp import ClientSession

    headers = _build_auth_headers(server)

    if server.transport == "sse":
        from mcp.client.sse import sse_client as transport_client

        async with transport_client(server.url, headers=headers) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
    else:
        from mcp.client.streamable_http import streamablehttp_client as transport_client

        async with transport_client(server.url, headers=headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()

    tools = []
    for t in result.tools:
        schema = {}
        if hasattr(t, "inputSchema") and t.inputSchema:
            schema = t.inputSchema if isinstance(t.inputSchema, dict) else t.inputSchema.model_dump()
        tools.append({
            "name": t.name,
            "description": t.description or "",
            "inputSchema": schema,
        })
    return tools


async def execute_mcp_tool(server: MCPServer, tool_name: str, arguments: dict) -> dict:
    """Execute a tool on an MCP server and return {success, output, error}."""
    import json
    from mcp import ClientSession

    headers = _build_auth_headers(server)

    try:
        if server.transport == "sse":
            from mcp.client.sse import sse_client as transport_client

            async with transport_client(server.url, headers=headers) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(tool_name, arguments)
        else:
            from mcp.client.streamable_http import streamablehttp_client as transport_client

            async with transport_client(server.url, headers=headers) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(tool_name, arguments)

        parts = []
        for content in result.content:
            if hasattr(content, "text"):
                parts.append(content.text)
            elif hasattr(content, "model_dump"):
                parts.append(json.dumps(content.model_dump()))
            else:
                parts.append(str(content))
        return {"success": True, "output": "\n".join(parts)}

    except Exception as exc:
        logger.error("MCP tool execution failed — server=%s tool=%s: %s", server.name, tool_name, exc)
        return {"success": False, "error": str(exc)}


# ── DB helpers ────────────────────────────────────────────────────────────────

async def list_servers(db: AsyncSession) -> list[MCPServer]:
    result = await db.execute(select(MCPServer).order_by(MCPServer.created_at))
    return list(result.scalars().all())


async def get_server(db: AsyncSession, server_id: uuid.UUID) -> Optional[MCPServer]:
    result = await db.execute(select(MCPServer).where(MCPServer.id == server_id))
    return result.scalar_one_or_none()


async def create_server(db: AsyncSession, data: dict) -> MCPServer:
    server = MCPServer(
        name=data["name"],
        url=data["url"],
        description=data.get("description"),
        transport=data.get("transport", "http"),
        auth_type=data.get("auth_type", "none"),
        is_enabled=data.get("is_enabled", True),
        default_risk_level=data.get("default_risk_level", "high"),
    )
    auth_value = data.get("auth_value")
    if auth_value and data.get("auth_type", "none") != "none":
        server.auth_value_enc = encrypt_value(auth_value)

    db.add(server)
    await db.flush()  # get the id before discovery

    try:
        tools = await discover_tools(server)
        server.discovered_tools = tools
        server.last_discovered_at = datetime.now(timezone.utc)
    except Exception as exc:
        logger.warning("Initial discovery failed for new MCP server '%s': %s", server.name, exc)

    await db.commit()
    await db.refresh(server)
    return server


async def update_server(db: AsyncSession, server: MCPServer, data: dict) -> MCPServer:
    for field in ("name", "url", "description", "transport", "auth_type", "is_enabled", "default_risk_level"):
        if field in data:
            setattr(server, field, data[field])

    if "auth_value" in data:
        if data["auth_value"] and server.auth_type != "none":
            server.auth_value_enc = encrypt_value(data["auth_value"])
        elif not data["auth_value"]:
            server.auth_value_enc = None

    server.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(server)
    return server


async def delete_server(db: AsyncSession, server: MCPServer) -> None:
    await db.delete(server)
    await db.commit()


async def rediscover_server(db: AsyncSession, server: MCPServer) -> MCPServer:
    tools = await discover_tools(server)
    server.discovered_tools = tools
    server.last_discovered_at = datetime.now(timezone.utc)
    server.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(server)
    return server


async def upsert_tool_override(
    db: AsyncSession,
    server: MCPServer,
    tool_name: str,
    risk_level: Optional[str],
    is_enabled: Optional[bool],
) -> MCPToolOverride:
    result = await db.execute(
        select(MCPToolOverride).where(
            MCPToolOverride.mcp_server_id == server.id,
            MCPToolOverride.tool_name == tool_name,
        )
    )
    override = result.scalar_one_or_none()

    if override is None:
        override = MCPToolOverride(
            mcp_server_id=server.id,
            tool_name=tool_name,
            risk_level=risk_level or server.default_risk_level,
            is_enabled=is_enabled if is_enabled is not None else True,
        )
        db.add(override)
    else:
        if risk_level is not None:
            override.risk_level = risk_level
        if is_enabled is not None:
            override.is_enabled = is_enabled

    await db.commit()
    await db.refresh(override)
    return override


async def get_enabled_servers_with_overrides(db: AsyncSession) -> list[tuple[MCPServer, dict]]:
    """Return [(server, {tool_name: override})] for all enabled servers."""
    servers_result = await db.execute(
        select(MCPServer).where(MCPServer.is_enabled == True).order_by(MCPServer.created_at)
    )
    servers = list(servers_result.scalars().all())

    result = []
    for server in servers:
        overrides_result = await db.execute(
            select(MCPToolOverride).where(MCPToolOverride.mcp_server_id == server.id)
        )
        overrides = {o.tool_name: o for o in overrides_result.scalars().all()}
        result.append((server, overrides))
    return result
