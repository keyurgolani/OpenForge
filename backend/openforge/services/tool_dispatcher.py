"""
Unified Tool Dispatcher for OpenForge.

Provides a unified interface for dispatching tool calls to:
1. Built-in tools via the tool server (HTTP REST)
2. External MCP servers (MCP protocol)

Handles HITL approval flows for high-risk tools.
"""
import logging
from typing import Any, Optional
from dataclasses import dataclass
from enum import Enum

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ToolDefinition
from openforge.config import get_settings

logger = logging.getLogger(__name__)


class ToolSource(Enum):
    """Source of the tool."""
    BUILTIN = "builtin"  # Built-in tool, executed via tool server
    EXTERNAL = "external"  # External MCP server


class RiskLevel(Enum):
    """Risk levels for tools."""
    LOW = "low"  # Auto-approve
    MEDIUM = "medium"  # Warn but auto-approve
    HIGH = "high"  # Require approval
    CRITICAL = "critical"  # Always block or require explicit approval


@dataclass
class ToolCallRequest:
    """Request to execute a tool."""
    tool_id: str
    params: dict[str, Any]
    workspace_id: str
    execution_id: str
    conversation_id: Optional[str] = None

    # Context for tool execution
    workspace_path: Optional[str] = None
    main_app_url: Optional[str] = None


@dataclass
class ToolCallResult:
    """Result of a tool execution."""
    success: bool
    output: Any
    error: Optional[str] = None
    truncated: bool = False
    original_length: Optional[int] = None
    requires_approval: bool = False
    approval_request_id: Optional[str] = None


class ToolDispatcher:
    """
    Unified dispatcher for tool execution.

    Routes tool calls to the appropriate destination and handles
    approval flows for high-risk operations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.settings = get_settings()
        self._tool_cache: dict[str, ToolDefinition] = {}

    async def _get_tool_definition(self, tool_id: str) -> Optional[ToolDefinition]:
        """Get tool definition from cache or database."""
        if tool_id in self._tool_cache:
            return self._tool_cache[tool_id]

        result = await self.db.execute(
            select(ToolDefinition).where(ToolDefinition.id == tool_id)
        )
        tool = result.scalar_one_or_none()

        if tool:
            self._tool_cache[tool_id] = tool

        return tool

    async def get_available_tools(self) -> list[dict]:
        """
        Get all available tools (built-in and external).

        Returns a list of tool definitions suitable for LLM tool schemas.
        """
        result = await self.db.execute(
            select(ToolDefinition).where(ToolDefinition.is_enabled == True)
        )
        tools = result.scalars().all()

        return [
            {
                "type": "function",
                "function": {
                    "name": t.id.replace(".", "_"),  # LLM-safe function name
                    "description": t.description,
                    "parameters": t.input_schema,
                },
                "metadata": {
                    "id": t.id,
                    "category": t.category,
                    "risk_level": t.risk_level,
                    "source": "builtin",
                }
            }
            for t in tools
        ]

    async def check_approval_required(self, tool_id: str) -> tuple[bool, str]:
        """
        Check if a tool call requires HITL approval.

        Returns (requires_approval, reason).
        """
        tool = await self._get_tool_definition(tool_id)

        if not tool:
            return True, f"Unknown tool: {tool_id}"

        if tool.risk_level == "critical":
            return True, f"Critical risk tool requires approval: {tool_id}"
        elif tool.risk_level == "high":
            return True, f"High risk tool requires approval: {tool_id}"
        elif tool.risk_level == "medium":
            # Medium risk could be configurable
            return False, ""

        return False, ""

    async def dispatch(
        self,
        request: ToolCallRequest,
        skip_approval: bool = False,
    ) -> ToolCallResult:
        """
        Dispatch a tool call to the appropriate handler.

        Args:
            request: The tool call request
            skip_approval: If True, skip HITL approval (used for approved requests)

        Returns:
            ToolCallResult with the execution result
        """
        # Get tool definition
        tool = await self._get_tool_definition(request.tool_id)

        if not tool:
            return ToolCallResult(
                success=False,
                output=None,
                error=f"Tool not found: {request.tool_id}",
            )

        if not tool.is_enabled:
            return ToolCallResult(
                success=False,
                output=None,
                error=f"Tool is disabled: {request.tool_id}",
            )

        # Check if approval is required
        requires_approval, reason = await self.check_approval_required(request.tool_id)

        if requires_approval and not skip_approval:
            # Return a result indicating approval is needed
            # The caller (agent engine) should handle creating the HITL request
            return ToolCallResult(
                success=False,
                output=None,
                error=reason,
                requires_approval=True,
            )

        # Dispatch to appropriate handler
        if tool.category in ["filesystem", "git", "http", "shell", "language", "memory", "task", "skills"]:
            return await self._dispatch_to_tool_server(request)
        else:
            # Unknown category - could be external MCP tool
            return ToolCallResult(
                success=False,
                output=None,
                error=f"Unknown tool category: {tool.category}",
            )

    async def _dispatch_to_tool_server(self, request: ToolCallRequest) -> ToolCallResult:
        """Dispatch a tool call to the tool server."""
        url = f"{self.settings.tool_server_url}/tools/execute"

        payload = {
            "tool_id": request.tool_id,
            "params": request.params,
            "context": {
                "workspace_id": request.workspace_id,
                "workspace_path": request.workspace_path or f"/workspace/{request.workspace_id}",
                "execution_id": request.execution_id,
                "main_app_url": request.main_app_url or self.settings.base_url,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload)

                if response.status_code == 404:
                    return ToolCallResult(
                        success=False,
                        output=None,
                        error=f"Tool not found on server: {request.tool_id}",
                    )

                response.raise_for_status()
                data = response.json()

                return ToolCallResult(
                    success=data.get("success", False),
                    output=data.get("output"),
                    error=data.get("error"),
                    truncated=data.get("truncated", False),
                    original_length=data.get("original_length"),
                )

        except httpx.TimeoutException:
            return ToolCallResult(
                success=False,
                output=None,
                error="Tool execution timed out",
            )
        except httpx.HTTPStatusError as e:
            return ToolCallResult(
                success=False,
                output=None,
                error=f"Tool server error: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"Error dispatching to tool server: {request.tool_id}")
            return ToolCallResult(
                success=False,
                output=None,
                error=f"Failed to execute tool: {str(e)}",
            )

    async def validate_params(self, tool_id: str, params: dict) -> tuple[bool, str]:
        """
        Validate tool parameters against the schema.

        Returns (is_valid, error_message).
        """
        import jsonschema

        tool = await self._get_tool_definition(tool_id)

        if not tool:
            return False, f"Tool not found: {tool_id}"

        try:
            jsonschema.validate(params, tool.input_schema)
            return True, ""
        except jsonschema.ValidationError as e:
            return False, f"Parameter validation failed: {e.message}"
        except Exception as e:
            return False, f"Validation error: {str(e)}"


async def get_tool_dispatcher(db: AsyncSession) -> ToolDispatcher:
    """Get a tool dispatcher instance."""
    return ToolDispatcher(db)
