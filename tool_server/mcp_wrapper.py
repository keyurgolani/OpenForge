"""
MCP Server Wrapper for OpenForge Tool Server.

Exposes built-in tools via the Model Context Protocol (MCP) for external clients
like Claude Desktop, Cursor, Windsurf, etc.

Uses HTTP Streamable transport as specified in MCP 2025-03-26.
"""
import json
import logging
from typing import Any, Optional
from dataclasses import dataclass

from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource

from protocol import BaseTool, ToolContext
from registry import registry
from config import get_settings

logger = logging.getLogger("tool-server.mcp")


@dataclass
class MCPContext:
    """Context for MCP tool execution."""
    workspace_id: str
    workspace_path: str
    execution_id: str


class MCPToolServer:
    """
    MCP Server that exposes OpenForge tools.

    Wraps the tool registry to provide MCP-compatible tool definitions
    and executes tools via the registry.
    """

    def __init__(self):
        self.settings = get_settings()
        self.server = Server("openforge-tools")
        self._setup_handlers()

    def _setup_handlers(self):
        """Set up MCP server handlers."""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """Return all available tools as MCP Tool objects."""
            tools = []
            for tool_def in registry.list_all():
                tools.append(Tool(
                    name=tool_def["id"],
                    description=tool_def["description"],
                    inputSchema=tool_def["input_schema"],
                ))
            return tools

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent | ImageContent | EmbeddedResource]:
            """Execute a tool and return the result."""
            tool = registry.get(name)
            if not tool:
                return [TextContent(
                    type="text",
                    text=f"Error: Tool not found: {name}"
                )]

            # Build context from arguments
            # MCP clients should provide workspace context
            workspace_id = arguments.pop("_workspace_id", "default")
            workspace_path = arguments.pop("_workspace_path", f"/workspace/{workspace_id}")
            execution_id = arguments.pop("_execution_id", "mcp-execution")

            context = ToolContext(
                workspace_id=workspace_id,
                workspace_path=workspace_path,
                execution_id=execution_id,
                main_app_url=self.settings.main_app_url,
            )

            try:
                result = await tool.execute(arguments, context)

                if result.success:
                    output = result.output
                    if isinstance(output, dict):
                        output_text = json.dumps(output, indent=2)
                    elif isinstance(output, str):
                        output_text = output
                    else:
                        output_text = str(output)

                    if result.truncated:
                        output_text += f"\n\n[Output truncated. Original length: {result.original_length}]"

                    return [TextContent(type="text", text=output_text)]
                else:
                    return [TextContent(
                        type="text",
                        text=f"Error: {result.error or 'Unknown error'}"
                    )]

            except Exception as e:
                logger.exception(f"Error executing tool {name}")
                return [TextContent(
                    type="text",
                    text=f"Error executing tool: {str(e)}"
                )]

    def get_session_manager(self) -> StreamableHTTPSessionManager:
        """Get the streamable HTTP session manager for the MCP server."""
        return StreamableHTTPSessionManager(self.server)


def create_mcp_app():
    """Create the MCP server application."""
    mcp_server = MCPToolServer()
    return mcp_server.server


# Export for main.py
mcp_server = MCPToolServer()
