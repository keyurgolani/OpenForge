"""Agent definition domain API router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import (
    AgentDefinitionCreate,
    AgentDefinitionListResponse,
    AgentDefinitionResponse,
    AgentDefinitionUpdate,
    AgentDefinitionVersionListResponse,
    AgentDefinitionVersionResponse,
)
from .service import AgentService

router = APIRouter()


def get_agent_service(db=Depends(get_db)) -> AgentService:
    return AgentService(db)


@router.get("", response_model=AgentDefinitionListResponse)
async def list_agents(
    skip: int = 0,
    limit: int = 100,
    mode: str | None = None,
    service: AgentService = Depends(get_agent_service),
):
    agents, total = await service.list_agents(skip=skip, limit=limit, mode=mode)
    return {"agents": agents, "total": total}


@router.post("", response_model=AgentDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    data: AgentDefinitionCreate,
    service: AgentService = Depends(get_agent_service),
):
    return await service.create_agent(data.model_dump())


@router.get("/{agent_id}", response_model=AgentDefinitionResponse)
async def get_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    agent = await service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentDefinitionResponse)
async def update_agent(
    agent_id: UUID,
    data: AgentDefinitionUpdate,
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


@router.get("/{agent_id}/versions", response_model=AgentDefinitionVersionListResponse)
async def list_versions(
    agent_id: UUID,
    skip: int = 0,
    limit: int = 50,
    service: AgentService = Depends(get_agent_service),
):
    versions, total = await service.list_versions(agent_id, skip=skip, limit=limit)
    return {"versions": versions, "total": total}


@router.get("/{agent_id}/versions/{version_id}", response_model=AgentDefinitionVersionResponse)
async def get_version(
    agent_id: UUID,
    version_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    version = await service.get_version(agent_id, version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return version
