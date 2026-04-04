from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any

from config import get_settings
from protocol import ToolContext
from registry import registry

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.WARNING),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("tool_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    registry.auto_discover("tools")
    logger.info("Tool registry loaded %d tools", len(registry.list_tools()))

    # Seed built-in and Tier 1 external skills (idempotent, non-blocking)
    try:
        from seed_skills import seed_native_skills, seed_external_skills

        seed_native_skills(settings.skills_dir)
        await seed_external_skills(settings.skills_root, settings.skills_dir)
    except Exception:
        logger.warning("Skill seeding failed; continuing startup", exc_info=True)

    yield


app = FastAPI(title="OpenForge Tool Server", version="0.1.0", lifespan=lifespan)


class ExecuteRequest(BaseModel):
    tool_id: str
    params: dict[str, Any] = {}
    context: dict[str, Any] = {}


class ExecuteResponse(BaseModel):
    tool_id: str
    success: bool
    output: Any = None
    error: str | None = None
    truncated: bool = False
    original_length: int | None = None


@app.post("/tools/execute", response_model=ExecuteResponse)
async def execute_tool(req: ExecuteRequest):
    tool = registry.get(req.tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{req.tool_id}' not found")

    ctx = ToolContext(
        workspace_id=req.context.get("workspace_id", ""),
        workspace_path=req.context.get(
            "workspace_path",
            f"{settings.workspace_root}/{req.context.get('workspace_id', '')}",
        ),
        execution_id=req.context.get("execution_id", ""),
        main_app_url=req.context.get("main_app_url", settings.main_app_url),
        conversation_id=req.context.get("conversation_id", ""),
        agent_id=req.context.get("agent_id", ""),
        deployment_id=req.context.get("deployment_id", ""),
        deployment_workspace_id=req.context.get("deployment_workspace_id", ""),
    )

    try:
        result = await tool.execute(req.params, ctx)
    except Exception as exc:
        logger.error("Tool '%s' raised exception: %s", req.tool_id, exc)
        return ExecuteResponse(tool_id=req.tool_id, success=False, error=str(exc))

    return ExecuteResponse(
        tool_id=req.tool_id,
        **result.to_dict(),
    )


@app.get("/tools/registry")
async def list_tools():
    return registry.list_tools()


@app.get("/tools/{tool_id}")
async def get_tool(tool_id: str):
    tool = registry.get(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")
    return tool.to_metadata()


@app.get("/skills")
async def list_installed_skills():
    """Return all installed skills with name, description, and full SKILL.md content."""
    from tools.skills.install import _list_installed_skills
    skills = _list_installed_skills(settings.skills_dir, include_content=True)
    return {"skills": skills}


@app.get("/tools/health")
async def health():
    return {"status": "ok", "version": "0.1.0", "tool_count": len(registry.list_tools())}


@app.get("/health")
async def root_health():
    return {"status": "ok", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.rest_port)
