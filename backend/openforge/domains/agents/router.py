"""Agent domain API router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db

from .schemas import (
    AgentCompileResponse,
    AgentCreate,
    AgentListResponse,
    AgentResponse,
    AgentTemplateCloneRequest,
    AgentUpdate,
    CompiledSpecListResponse,
    CompiledSpecResponse,
)
from .service import AgentService

router = APIRouter()


def get_agent_service(db=Depends(get_db)) -> AgentService:
    return AgentService(db)


# ── Template endpoints (before /{agent_id} to avoid route conflicts) ──


@router.get("/templates", response_model=AgentListResponse)
async def list_agent_templates(
    skip: int = 0,
    limit: int = 100,
    service: AgentService = Depends(get_agent_service),
):
    agents, total = await service.list_templates(skip=skip, limit=limit)
    return {"agents": agents, "total": total}


@router.get("/templates/{agent_id}", response_model=AgentResponse)
async def get_agent_template(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    template = await service.get_template(agent_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent template not found")
    return template


@router.post("/templates/{agent_id}/clone", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def clone_agent_template(
    agent_id: UUID,
    body: AgentTemplateCloneRequest,
    service: AgentService = Depends(get_agent_service),
):
    cloned = await service.clone_template(agent_id, body.model_dump(exclude_unset=True))
    if not cloned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent template not found")
    return cloned


# ── Standard CRUD endpoints ──


@router.get("", response_model=AgentListResponse)
async def list_agents(
    skip: int = 0,
    limit: int = 100,
    status_filter: str | None = Query(default=None, alias="status"),
    mode: str | None = None,
    is_template: bool | None = None,
    service: AgentService = Depends(get_agent_service),
):
    agents, total = await service.list_agents(
        skip=skip, limit=limit, status=status_filter, mode=mode, is_template=is_template
    )
    return {"agents": agents, "total": total}


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    data: AgentCreate,
    service: AgentService = Depends(get_agent_service),
):
    return await service.create_agent(data.model_dump())


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    agent = await service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    data: AgentUpdate,
    service: AgentService = Depends(get_agent_service),
):
    agent = await service.update_agent(agent_id, data.model_dump(exclude_unset=True))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    success = await service.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return None


# ── Compilation endpoints ──


@router.post("/{agent_id}/compile", response_model=AgentCompileResponse)
async def compile_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    result = await service.compile_agent(agent_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return result


@router.get("/{agent_id}/spec", response_model=CompiledSpecResponse)
async def get_active_spec(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    spec = await service.get_active_spec(agent_id)
    if not spec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active spec found")
    return spec


@router.get("/{agent_id}/specs", response_model=CompiledSpecListResponse)
async def list_specs(
    agent_id: UUID,
    skip: int = 0,
    limit: int = 50,
    service: AgentService = Depends(get_agent_service),
):
    specs, total = await service.list_specs(agent_id, skip=skip, limit=limit)
    return {"specs": specs, "total": total}
