"""
Workflow domain API router.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import WorkflowCreate, WorkflowListResponse, WorkflowResponse, WorkflowUpdate
from .service import WorkflowService

router = APIRouter()


def get_workflow_service(db=Depends(get_db)) -> WorkflowService:
    """Dependency to get workflow service."""
    return WorkflowService(db)


@router.get("/", response_model=WorkflowListResponse)
async def list_workflows(
    skip: int = 0,
    limit: int = 100,
    service: WorkflowService = Depends(get_workflow_service),
):
    """List all workflows."""
    workflows, total = await service.list_workflows(skip=skip, limit=limit)
    return {"workflows": workflows, "total": total}


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    service: WorkflowService = Depends(get_workflow_service),
):
    """Get a workflow by ID."""
    workflow = await service.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    return workflow


@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreate,
    service: WorkflowService = Depends(get_workflow_service),
):
    """Create a new workflow."""
    workflow = await service.create_workflow(workflow_data.model_dump())
    return workflow


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID,
    workflow_data: WorkflowUpdate,
    service: WorkflowService = Depends(get_workflow_service),
):
    """Update a workflow."""
    workflow = await service.update_workflow(workflow_id, workflow_data.model_dump(exclude_unset=True))
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    service: WorkflowService = Depends(get_workflow_service),
):
    """Delete a workflow."""
    success = await service.delete_workflow(workflow_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    return None
