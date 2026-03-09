"""
Skills API — proxy to the tool server's skills management tools.
Enables the frontend to install, list, and remove agent skills without
needing to open a chat session.
"""
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from openforge.services.tool_dispatcher import tool_dispatcher

router = APIRouter()

_SYSTEM_WORKSPACE = "system"

# Error detail set by the dispatcher when it cannot reach the tool server at all.
_CONNECT_ERROR_HINTS = ("Name or service not known", "Connection refused", "Connect call failed", "timed out")


def _is_unavailable(error: str) -> bool:
    return any(hint in error for hint in _CONNECT_ERROR_HINTS)


class SkillInstallRequest(BaseModel):
    source: str
    skill_names: Optional[list[str]] = None


async def _dispatch(tool_id: str, params: dict) -> dict:
    result = await tool_dispatcher.execute(
        tool_id=tool_id,
        params=params,
        workspace_id=_SYSTEM_WORKSPACE,
        execution_id=str(uuid.uuid4()),
    )
    if not result.get("success"):
        error = result.get("error") or "Tool execution failed"
        status = 503 if _is_unavailable(error) else 502
        raise HTTPException(status_code=status, detail=error)
    return result.get("output") or {}


@router.get("")
async def list_installed_skills():
    """Return all installed agent skills. Returns empty list when tool server is unavailable."""
    if not await tool_dispatcher.is_available():
        return {"skills": [], "count": 0, "tool_server_available": False}
    return await _dispatch("skills.list_installed", {})


@router.post("/install")
async def install_skill(body: SkillInstallRequest):
    """Install skills from a GitHub repository."""
    return await _dispatch("skills.install", {
        "source": body.source,
        "skill_names": body.skill_names or [],
    })


@router.get("/search")
async def search_skills(source: str):
    """List available skills in a GitHub repository without installing."""
    return await _dispatch("skills.search", {"source": source})


@router.delete("/{name}")
async def remove_skill(name: str):
    """Remove an installed skill by name."""
    return await _dispatch("skills.remove", {"name": name})
