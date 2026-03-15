"""Workflow domain API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import (
    WorkflowCreate,
    WorkflowEdgeCreate,
    WorkflowEdgeListResponse,
    WorkflowEdgeResponse,
    WorkflowEdgeUpdate,
    WorkflowListResponse,
    WorkflowNodeCreate,
    WorkflowNodeListResponse,
    WorkflowNodeResponse,
    WorkflowNodeUpdate,
    WorkflowResponse,
    WorkflowUpdate,
    WorkflowVersionCreate,
    WorkflowVersionListResponse,
    WorkflowVersionResponse,
)
from .service import WorkflowService

router = APIRouter()


def get_workflow_service(db=Depends(get_db)) -> WorkflowService:
    return WorkflowService(db)


@router.get("/", response_model=WorkflowListResponse)
async def list_workflows(
    skip: int = 0,
    limit: int = 100,
    workspace_id: UUID | None = None,
    status: str | None = None,
    is_system: bool | None = None,
    is_template: bool | None = None,
    service: WorkflowService = Depends(get_workflow_service),
):
    list_kwargs = {"skip": skip, "limit": limit}
    if workspace_id is not None:
        list_kwargs["workspace_id"] = workspace_id
    if status is not None:
        list_kwargs["status"] = status
    if is_system is not None:
        list_kwargs["is_system"] = is_system
    if is_template is not None:
        list_kwargs["is_template"] = is_template
    workflows, total = await service.list_workflows(**list_kwargs)
    return {"workflows": workflows, "total": total}


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    workflow = await service.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(body: WorkflowCreate, service: WorkflowService = Depends(get_workflow_service)):
    return await service.create_workflow(body.model_dump())


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: UUID, body: WorkflowUpdate, service: WorkflowService = Depends(get_workflow_service)):
    workflow = await service.update_workflow(workflow_id, body.model_dump(exclude_unset=True))
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(workflow_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    success = await service.delete_workflow(workflow_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return None


@router.get("/{workflow_id}/versions", response_model=WorkflowVersionListResponse)
async def list_workflow_versions(workflow_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    versions = await service.list_versions(workflow_id)
    return {"versions": versions, "total": len(versions)}


@router.get("/{workflow_id}/versions/{version_id}", response_model=WorkflowVersionResponse)
async def get_workflow_version(workflow_id: UUID, version_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    version = await service.get_version(workflow_id, version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow version not found")
    return version


@router.post("/{workflow_id}/versions", response_model=WorkflowVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_version(workflow_id: UUID, body: WorkflowVersionCreate, service: WorkflowService = Depends(get_workflow_service)):
    version = await service.create_version(workflow_id, body.model_dump())
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return version


@router.post("/{workflow_id}/versions/{version_id}/activate", response_model=WorkflowResponse)
async def activate_workflow_version(workflow_id: UUID, version_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    workflow = await service.activate_version(workflow_id, version_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow or version not found")
    return workflow


@router.get("/{workflow_id}/versions/{version_id}/nodes", response_model=WorkflowNodeListResponse)
async def list_workflow_nodes(workflow_id: UUID, version_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    nodes = await service.list_nodes(workflow_id, version_id)
    return {"nodes": nodes, "total": len(nodes)}


@router.post("/{workflow_id}/versions/{version_id}/nodes", response_model=WorkflowNodeResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_node(workflow_id: UUID, version_id: UUID, body: WorkflowNodeCreate, service: WorkflowService = Depends(get_workflow_service)):
    node = await service.create_node(workflow_id, version_id, body.model_dump(exclude_unset=True))
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow version not found")
    return node


@router.patch("/{workflow_id}/versions/{version_id}/nodes/{node_id}", response_model=WorkflowNodeResponse)
async def update_workflow_node(
    workflow_id: UUID,
    version_id: UUID,
    node_id: UUID,
    body: WorkflowNodeUpdate,
    service: WorkflowService = Depends(get_workflow_service),
):
    node = await service.update_node(workflow_id, version_id, node_id, body.model_dump(exclude_unset=True))
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow node not found")
    return node


@router.delete("/{workflow_id}/versions/{version_id}/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow_node(workflow_id: UUID, version_id: UUID, node_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    success = await service.delete_node(workflow_id, version_id, node_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow node not found")
    return None


@router.get("/{workflow_id}/versions/{version_id}/edges", response_model=WorkflowEdgeListResponse)
async def list_workflow_edges(workflow_id: UUID, version_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    edges = await service.list_edges(workflow_id, version_id)
    return {"edges": edges, "total": len(edges)}


@router.post("/{workflow_id}/versions/{version_id}/edges", response_model=WorkflowEdgeResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_edge(workflow_id: UUID, version_id: UUID, body: WorkflowEdgeCreate, service: WorkflowService = Depends(get_workflow_service)):
    edge = await service.create_edge(workflow_id, version_id, body.model_dump(exclude_unset=True))
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow version not found")
    return edge


@router.patch("/{workflow_id}/versions/{version_id}/edges/{edge_id}", response_model=WorkflowEdgeResponse)
async def update_workflow_edge(
    workflow_id: UUID,
    version_id: UUID,
    edge_id: UUID,
    body: WorkflowEdgeUpdate,
    service: WorkflowService = Depends(get_workflow_service),
):
    edge = await service.update_edge(workflow_id, version_id, edge_id, body.model_dump(exclude_unset=True))
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow edge not found")
    return edge


@router.delete("/{workflow_id}/versions/{version_id}/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow_edge(workflow_id: UUID, version_id: UUID, edge_id: UUID, service: WorkflowService = Depends(get_workflow_service)):
    success = await service.delete_edge(workflow_id, version_id, edge_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow edge not found")
    return None
