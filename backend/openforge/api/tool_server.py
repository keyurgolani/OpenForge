"""Tool server backed API surfaces for skills and tool registry inspection."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from openforge.integrations.tools.dispatcher import tool_dispatcher

router = APIRouter()


class SkillInstallRequest(BaseModel):
    source: str = Field(..., min_length=1)
    skill_names: list[str] | None = None


def _system_execution_id() -> str:
    return f"settings-{uuid4()}"


async def _execute_tool(tool_id: str, params: dict):
    result = await tool_dispatcher.execute(
        tool_id=tool_id,
        params=params,
        workspace_id="system",
        execution_id=_system_execution_id(),
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.get("error") or f"Tool execution failed: {tool_id}",
        )
    return result.get("output")


@router.get("/skills")
async def list_skills():
    available = await tool_dispatcher.is_available()
    skills = await tool_dispatcher.list_skills() if available else []
    return {"skills": skills, "tool_server_available": available}


@router.post("/skills/install")
async def install_skills(body: SkillInstallRequest):
    if not await tool_dispatcher.is_available():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Tool server is unavailable")
    output = await _execute_tool(
        "skills.install",
        {"source": body.source, "skill_names": body.skill_names or []},
    )
    return output


@router.get("/skills/search")
async def search_skills(source: str = Query(..., min_length=1)):
    if not await tool_dispatcher.is_available():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Tool server is unavailable")
    output = await _execute_tool("skills.search", {"source": source})
    return output


@router.delete("/skills/{name}")
async def remove_skill(name: str):
    if not await tool_dispatcher.is_available():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Tool server is unavailable")
    output = await _execute_tool("skills.remove", {"name": name})
    return output


@router.get("/tools/registry")
async def get_tool_registry():
    available = await tool_dispatcher.is_available()
    tools = await tool_dispatcher.list_tools() if available else []
    return {"tools": tools, "tool_server_available": available}
