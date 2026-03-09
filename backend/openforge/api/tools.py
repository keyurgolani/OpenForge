"""
Tools Registry API — exposes the tool server's registered tool catalogue
to the frontend for documentation and configuration purposes.
"""
from fastapi import APIRouter
from openforge.services.tool_dispatcher import tool_dispatcher

router = APIRouter()


@router.get("/registry")
async def get_tool_registry():
    """Return full tool metadata from the tool server, or empty list if unavailable."""
    if not await tool_dispatcher.is_available():
        return {"tools": [], "tool_server_available": False}
    tools = await tool_dispatcher.list_tools()
    return {"tools": tools, "tool_server_available": True}
