"""
Tool registry for OpenForge Tool Server.

Manages discovery, registration, and lookup of all available tools.
"""
from typing import Dict, Type
from tool_server.protocol import BaseTool, ToolContext, ToolResult
from tool_server.config import get_settings
import importlib
import pkgutil
import logging
import os

logger = logging.getLogger("tool-server.registry")


class ToolRegistry:
    """Registry for all available tools."""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}

    def register(self, tool: BaseTool):
        """Register a tool instance."""
        self._tools[tool.id] = tool
        logger.info(f"Registered tool: {tool.id} [{tool.risk_level}]")

    def get(self, tool_id: str) -> BaseTool | None:
        """Get a tool by ID."""
        return self._tools.get(tool_id)

    def list_all(self) -> list[dict]:
        """List all registered tools with their metadata."""
        return [
            {
                "id": t.id,
                "category": t.category,
                "display_name": t.display_name,
                "description": t.description,
                "input_schema": t.input_schema,
                "risk_level": t.risk_level,
            }
            for t in self._tools.values()
        ]

    def auto_discover(self, package_path: str = "tools"):
        """
        Scan the tools/ directory and register all tool classes.

        Each tool module should define a TOOLS list containing tool instances.
        """
        tools_package = os.path.join(os.path.dirname(__file__), package_path)

        if not os.path.exists(tools_package):
            logger.warning(f"Tools directory not found: {tools_package}")
            return

        # Iterate through all subdirectories in tools/
        for category_dir in os.listdir(tools_package):
            category_path = os.path.join(tools_package, category_dir)
            if not os.path.isdir(category_path):
                continue
            if category_dir.startswith("_") or category_dir.startswith("."):
                continue

            # Check for __init__.py with TOOLS export
            init_path = os.path.join(category_path, "__init__.py")
            if os.path.exists(init_path):
                try:
                    module_name = f"tool_server.tools.{category_dir}"
                    module = importlib.import_module(module_name)
                    if hasattr(module, "TOOLS"):
                        for tool in module.TOOLS:
                            if isinstance(tool, BaseTool):
                                self.register(tool)
                except Exception as e:
                    logger.error(f"Failed to load tools from {category_dir}: {e}")

        logger.info(f"Auto-discovery complete. {len(self._tools)} tools registered.")


# Singleton registry
registry = ToolRegistry()
