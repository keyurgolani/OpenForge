"""
MCP (Model Context Protocol) infrastructure for OpenForge.

This module provides MCP server and client utilities.
"""

from typing import Any, Optional


class MCPServer:
    """Base MCP server interface."""
    
    async def start(self) -> None:
        """Start the MCP server."""
        raise NotImplementedError
    
    async def stop(self) -> None:
        """Stop the MCP server."""
        raise NotImplementedError
    
    async def list_tools(self) -> list[dict[str, Any]]:
        """List available tools."""
        raise NotImplementedError
    
    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Call a tool."""
        raise NotImplementedError


class MCPClient:
    """Base MCP client interface."""
    
    async def connect(self, server_url: str) -> None:
        """Connect to an MCP server."""
        raise NotImplementedError
    
    async def disconnect(self) -> None:
        """Disconnect from the MCP server."""
        raise NotImplementedError
    
    async def list_tools(self) -> list[dict[str, Any]]:
        """List available tools from the server."""
        raise NotImplementedError
    
    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Call a tool on the server."""
        raise NotImplementedError


__all__ = ["MCPServer", "MCPClient"]
