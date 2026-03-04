from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from openforge.db.postgres import get_db
from openforge.services.workspace_service import workspace_service
from openforge.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse

router = APIRouter()


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(db: AsyncSession = Depends(get_db)):
    return await workspace_service.list_workspaces(db)


@router.post("", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(body: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    return await workspace_service.create_workspace(db, body)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return await workspace_service.get_workspace(db, workspace_id)


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: UUID, body: WorkspaceUpdate, db: AsyncSession = Depends(get_db)
):
    return await workspace_service.update_workspace(db, workspace_id, body)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    await workspace_service.delete_workspace(db, workspace_id)
