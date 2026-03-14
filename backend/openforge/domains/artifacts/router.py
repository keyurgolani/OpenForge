"""
Artifact domain API router.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.openforge.db.session import get_db

from .schemas import ArtifactCreate, ArtifactResponse, ArtifactUpdate
from .service import ArtifactService

router = APIRouter()


def get_artifact_service(db: AsyncSession = Depends(get_db)) -> ArtifactService:
    """Dependency to get artifact service."""
    return ArtifactService(db)


@router.get("/", response_model=dict)
async def list_artifacts(
    skip: int = 0,
    limit: int = 100,
    service: ArtifactService = Depends(get_artifact_service),
):
    """List all artifacts."""
    artifacts, total = await service.list_artifacts(skip=skip, limit=limit)
    return {"artifacts": artifacts, "total": total}


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Get an artifact by ID."""
    artifact = await service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found",
        )
    return artifact


@router.post("/", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
async def create_artifact(
    artifact_data: ArtifactCreate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Create a new artifact."""
    artifact = await service.create_artifact(artifact_data.model_dump())
    return artifact


@router.patch("/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(
    artifact_id: UUID,
    artifact_data: ArtifactUpdate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Update an artifact."""
    artifact = await service.update_artifact(artifact_id, artifact_data.model_dump(exclude_unset=True))
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found",
        )
    return artifact


@router.delete("/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_artifact(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Delete an artifact."""
    success = await service.delete_artifact(artifact_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found",
        )
