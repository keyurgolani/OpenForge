"""
MCP Server Management Service for OpenForge.

Handles external MCP server configuration, discovery, and tool management.
"""
import logging
from typing import Optional
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from openforge.db.models import MCPServer, MCPToolOverride
from openforge.config import get_settings

logger = logging.getLogger(__name__)


class MCPService:
    """Service for managing external MCP servers."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.settings = get_settings()

    async def list_servers(self, include_disabled: bool = False) -> list[MCPServer]:
        """List all configured MCP servers."""
        query = select(MCPServer)

        if not include_disabled:
            query = query.where(MCPServer.is_enabled == True)

        query = query.order_by(MCPServer.name)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_server(self, server_id: str) -> Optional[MCPServer]:
        """Get a specific MCP server by ID."""
        result = await self.db.execute(
            select(MCPServer).where(MCPServer.id == server_id)
        )
        return result.scalar_one_or_none()

    async def create_server(
        self,
        name: str,
        url: str,
        description: Optional[str] = None,
        auth_type: str = "none",
        auth_value: Optional[str] = None,
        default_risk_level: str = "high",
    ) -> MCPServer:
        """Create a new MCP server configuration."""
        server = MCPServer(
            name=name,
            url=url,
            description=description,
            auth_type=auth_type,
            default_risk_level=default_risk_level,
            is_enabled=True,
        )

        # Handle auth value encryption if needed
        if auth_value and auth_type != "none":
            # TODO: Implement proper encryption
            # For now, store as-is (not recommended for production)
            server.auth_value_enc = auth_value.encode("utf-8")

        self.db.add(server)
        await self.db.commit()
        await self.db.refresh(server)

        return server

    async def update_server(
        self,
        server_id: str,
        name: Optional[str] = None,
        url: Optional[str] = None,
        description: Optional[str] = None,
        auth_type: Optional[str] = None,
        auth_value: Optional[str] = None,
        default_risk_level: Optional[str] = None,
        is_enabled: Optional[bool] = None,
    ) -> Optional[MCPServer]:
        """Update an MCP server configuration."""
        server = await self.get_server(server_id)
        if not server:
            return None

        if name is not None:
            server.name = name
        if url is not None:
            server.url = url
        if description is not None:
            server.description = description
        if auth_type is not None:
            server.auth_type = auth_type
        if auth_value is not None:
            if server.auth_type == "none":
                server.auth_value_enc = None
            else:
                # TODO: Implement proper encryption
                server.auth_value_enc = auth_value.encode("utf-8")
        if default_risk_level is not None:
            server.default_risk_level = default_risk_level
        if is_enabled is not None:
            server.is_enabled = is_enabled

        server.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(server)

        return server

    async def delete_server(self, server_id: str) -> bool:
        """Delete an MCP server configuration."""
        server = await self.get_server(server_id)
        if not server:
            return False

        await self.db.delete(server)
        await self.db.commit()
        return True

    async def discover_tools(self, server_id: str) -> dict:
        """
        Discover tools from an MCP server.

        Calls the server's tools/list endpoint and caches the results.
        Returns the discovered tools.
        """
        server = await self.get_server(server_id)
        if not server:
            return {"error": "Server not found", "tools": []}

        headers = self._build_auth_headers(server)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Try MCP tools/list endpoint
                response = await client.post(
                    f"{server.url}/tools/list",
                    headers=headers,
                    json={}
                )

                if response.status_code != 200:
                    # Try alternate endpoint format
                    response = await client.get(
                        f"{server.url}/mcp/tools",
                        headers=headers
                    )

                if response.status_code != 200:
                    logger.error(f"Failed to discover tools from {server.name}: {response.status_code}")
                    return {
                        "error": f"HTTP {response.status_code}",
                        "tools": []
                    }

                data = response.json()
                tools = data.get("tools", [])

                # Update server with discovered tools
                server.discovered_tools = tools
                server.last_discovered_at = datetime.utcnow()
                await self.db.commit()

                return {
                    "tools": tools,
                    "count": len(tools),
                    "server_name": server.name,
                }

        except httpx.HTTPError as e:
            logger.error(f"Error discovering tools from {server.name}: {e}")
            return {"error": str(e), "tools": []}

    def _build_auth_headers(self, server: MCPServer) -> dict:
        """Build authentication headers for MCP server requests."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if server.auth_type == "none" or not server.auth_value_enc:
            return headers

        # Decrypt auth value
        # TODO: Implement proper decryption
        auth_value = server.auth_value_enc.decode("utf-8")

        if server.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {auth_value}"
        elif server.auth_type == "api_key":
            headers["X-API-Key"] = auth_value
        elif server.auth_type == "header":
            # Assume format: "Header-Name: value"
            if ":" in auth_value:
                name, value = auth_value.split(":", 1)
                headers[name.strip()] = value.strip()

        return headers

    async def get_tool_override(
        self, server_id: str, tool_name: str
    ) -> Optional[MCPToolOverride]:
        """Get the override configuration for a specific tool."""
        result = await self.db.execute(
            select(MCPToolOverride).where(
                MCPToolOverride.mcp_server_id == server_id,
                MCPToolOverride.tool_name == tool_name,
            )
        )
        return result.scalar_one_or_none()

    async def set_tool_override(
        self,
        server_id: str,
        tool_name: str,
        risk_level: Optional[str] = None,
        is_enabled: Optional[bool] = None,
    ) -> MCPToolOverride:
        """Set or update the override for a specific tool."""
        override = await self.get_tool_override(server_id, tool_name)

        if override:
            if risk_level is not None:
                override.risk_level = risk_level
            if is_enabled is not None:
                override.is_enabled = is_enabled
        else:
            override = MCPToolOverride(
                mcp_server_id=server_id,
                tool_name=tool_name,
                risk_level=risk_level or "high",
                is_enabled=is_enabled if is_enabled is not None else True,
            )
            self.db.add(override)

        await self.db.commit()
        await self.db.refresh(override)

        return override

    async def get_all_tools(self) -> list[dict]:
        """
        Get all available tools from all enabled MCP servers.

        Returns a flat list of tools with server and risk information.
        """
        servers = await self.list_servers(include_disabled=False)

        all_tools = []
        for server in servers:
            if not server.discovered_tools:
                continue

            for tool in server.discovered_tools:
                tool_name = tool.get("name", "unknown")

                # Check for override
                override = await self.get_tool_override(str(server.id), tool_name)
                risk_level = override.risk_level if override else server.default_risk_level
                is_enabled = override.is_enabled if override else True

                all_tools.append({
                    "id": f"mcp.{server.name}.{tool_name}",
                    "name": tool_name,
                    "description": tool.get("description", ""),
                    "input_schema": tool.get("inputSchema", {}),
                    "risk_level": risk_level,
                    "is_enabled": is_enabled,
                    "server_id": str(server.id),
                    "server_name": server.name,
                    "source": "external",
                })

        return all_tools


async def get_mcp_service(db: AsyncSession) -> MCPService:
    """Get MCP service instance."""
    return MCPService(db)
