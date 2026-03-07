"""
OpenForge Tool Server - FastAPI Application.

Provides:
- Internal REST API for Celery workers to execute built-in tools
- Tool registry endpoint for discovery
- Health check endpoint
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any
import logging

from tool_server.registry import registry
from tool_server.protocol import ToolContext, ToolResult
from tool_server.config import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("tool-server")

app = FastAPI(
    title="OpenForge Tool Server",
    description="Workspace-scoped filesystem, git, shell, and language tools",
    version="0.1.0",
)


class ExecuteRequest(BaseModel):
    """Request to execute a tool."""
    tool_id: str
    params: dict[str, Any]
    context: dict[str, Any]  # Contains workspace_id, workspace_path, execution_id, etc.


class ExecuteResponse(BaseModel):
    """Response from tool execution."""
    success: bool
    output: Any
    error: str | None = None
    truncated: bool = False
    original_length: int | None = None


@app.on_event("startup")
async def startup():
    """Initialize tool registry on startup."""
    logger.info("Tool Server starting up...")
    registry.auto_discover()
    logger.info(f"Tool Server ready. {len(registry._tools)} tools available.")


@app.post("/tools/execute", response_model=ExecuteResponse)
async def execute_tool(request: ExecuteRequest) -> ExecuteResponse:
    """
    Execute a tool with the given parameters.

    The tool_id should be in the format "category.tool_name" (e.g., "filesystem.read_file").
    """
    tool = registry.get(request.tool_id)
    if not tool:
        raise HTTPException(404, f"Tool not found: {request.tool_id}")

    # Build context from request
    context = ToolContext(
        workspace_id=request.context.get("workspace_id", "default"),
        workspace_path=request.context.get("workspace_path", f"/workspace/{request.context.get('workspace_id', 'default')}/"),
        execution_id=request.context.get("execution_id", "unknown"),
        main_app_url=request.context.get("main_app_url", settings.main_app_url),
    )

    try:
        result = await tool.execute(request.params, context)
        return ExecuteResponse(
            success=result.success,
            output=result.output,
            error=result.error,
            truncated=result.truncated,
            original_length=result.original_length,
        )
    except Exception as e:
        logger.exception(f"Tool execution failed: {request.tool_id}")
        return ExecuteResponse(
            success=False,
            output=None,
            error=str(e),
        )


@app.get("/tools/registry")
async def list_tools():
    """
    List all registered tools.

    Returns tool metadata including ID, category, description, input schema, and risk level.
    """
    return registry.list_all()


@app.get("/tools/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "tool_count": len(registry.list_all()),
        "version": "0.1.0"
    }


@app.get("/tools/{tool_id}")
async def get_tool(tool_id: str):
    """Get details for a specific tool."""
    tool = registry.get(tool_id)
    if not tool:
        raise HTTPException(404, f"Tool not found: {tool_id}")

    return {
        "id": tool.id,
        "category": tool.category,
        "display_name": tool.display_name,
        "description": tool.description,
        "input_schema": tool.input_schema,
        "risk_level": tool.risk_level,
        "max_output_chars": tool.max_output_chars,
    }
