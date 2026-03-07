"""
Tool protocol definitions for OpenForge Tool Server.

Every tool implements the BaseTool interface and returns a ToolResult.
"""
from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import Any


class ToolResult(BaseModel):
    """Standard result type for all tool executions."""

    success: bool
    output: Any
    error: str | None = None

    # Context control hints for the agent engine
    truncated: bool = False
    original_length: int | None = None


class ToolContext(BaseModel):
    """Execution context passed to every tool."""

    workspace_id: str
    workspace_path: str  # /workspace/{workspace_id}/
    execution_id: str

    # For tools that need to call back to the main app
    main_app_url: str  # http://openforge:3000


class BaseTool(ABC):
    """Standard interface for all OpenForge built-in tools."""

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique tool identifier. E.g., 'filesystem.read_file'"""

    @property
    @abstractmethod
    def category(self) -> str:
        """Tool category. E.g., 'filesystem'"""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name."""

    @property
    @abstractmethod
    def description(self) -> str:
        """Description shown to the LLM for tool selection."""

    @property
    @abstractmethod
    def input_schema(self) -> dict:
        """JSON Schema for input parameters."""

    @property
    def risk_level(self) -> str:
        """
        Risk level for policy engine.
        Options: 'low', 'medium', 'high', 'critical'
        Default: 'low'
        """
        return "low"

    @property
    def max_output_chars(self) -> int | None:
        """
        Max output size before auto-truncation.
        None = no limit.
        """
        return 50000  # 50K chars default

    @abstractmethod
    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        """Execute the tool with the given parameters."""
