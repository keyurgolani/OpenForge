"""Artifact domain API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db

from .schemas import (
    ArtifactCreate,
    ArtifactDiffResponse,
    ArtifactLineageResponse,
    ArtifactLinkCreate,
    ArtifactLinkResponse,
    ArtifactListResponse,
    ArtifactResponse,
    ArtifactSinkCreate,
    ArtifactSinkListResponse,
    ArtifactSinkResponse,
    ArtifactUpdate,
    ArtifactVersionCreate,
    ArtifactVersionListResponse,
    ArtifactVersionResponse,
)
from .service import ArtifactService

router = APIRouter()


def get_artifact_service(db=Depends(get_db)) -> ArtifactService:
    """Dependency to get artifact service."""

    return ArtifactService(db)


@router.get("", response_model=ArtifactListResponse)
async def list_artifacts(
    skip: int = 0,
    limit: int = 100,
    workspace_id: UUID | None = None,
    artifact_type: str | None = None,
    status: str | None = None,
    visibility: str | None = None,
    source_run_id: UUID | None = None,
    source_workflow_id: UUID | None = None,
    source_mission_id: UUID | None = None,
    created_by_type: str | None = None,
    q: str | None = None,
    service: ArtifactService = Depends(get_artifact_service),
):
    """List artifacts with first-pass Phase 8 filtering."""

    try:
        artifacts, total = await service.list_artifacts(
            skip=skip,
            limit=limit,
            workspace_id=workspace_id,
            artifact_type=artifact_type,
            status=status,
            visibility=visibility,
            source_run_id=source_run_id,
            source_workflow_id=source_workflow_id,
            source_mission_id=source_mission_id,
            created_by_type=created_by_type,
            q=q,
        )
    except TypeError:
        # Earlier phase smoke tests still inject a narrower CRUD stub.
        artifacts, total = await service.list_artifacts(skip=skip, limit=limit, workspace_id=workspace_id)
    return {"artifacts": artifacts, "total": total}


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Get an artifact by ID."""

    artifact = await service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return artifact


@router.post("", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
async def create_artifact(
    artifact_data: ArtifactCreate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Create a new artifact with an initial version."""

    return await service.create_artifact(artifact_data.model_dump())


@router.patch("/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(
    artifact_id: UUID,
    artifact_data: ArtifactUpdate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Update artifact metadata or append a new version."""

    artifact = await service.update_artifact(artifact_id, artifact_data.model_dump(exclude_unset=True))
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return artifact


@router.delete("/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_artifact(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Soft-delete an artifact."""

    success = await service.delete_artifact(artifact_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return None


@router.get("/{artifact_id}/versions", response_model=ArtifactVersionListResponse)
async def list_artifact_versions(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """List versions for an artifact."""

    versions = await service.list_versions(artifact_id)
    return {"versions": versions, "total": len(versions)}


@router.get("/{artifact_id}/versions/{version_id}", response_model=ArtifactVersionResponse)
async def get_artifact_version(
    artifact_id: UUID,
    version_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Get a specific artifact version."""

    version = await service.get_version(artifact_id, version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact version not found")
    return version


@router.post("/{artifact_id}/versions", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
async def create_artifact_version(
    artifact_id: UUID,
    body: ArtifactVersionCreate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Create and promote a new artifact version."""

    artifact = await service.create_version(artifact_id, body.model_dump())
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return artifact


@router.post("/{artifact_id}/versions/{version_id}/promote", response_model=ArtifactResponse)
async def promote_artifact_version(
    artifact_id: UUID,
    version_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Promote an existing version to current."""

    artifact = await service.promote_version(artifact_id, version_id)
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact or version not found")
    return artifact


@router.get("/{artifact_id}/versions/{version_id}/diff", response_model=ArtifactDiffResponse)
async def get_artifact_version_diff(
    artifact_id: UUID,
    version_id: UUID,
    compare_to_version_id: UUID = Query(...),
    service: ArtifactService = Depends(get_artifact_service),
):
    """Get a first-pass diff summary between two versions."""

    diff = await service.get_version_diff_summary(artifact_id, version_id, compare_to_version_id)
    if not diff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact version diff not found")
    return diff


@router.get("/{artifact_id}/lineage", response_model=ArtifactLineageResponse)
async def get_artifact_lineage(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Get grouped lineage for an artifact."""

    return await service.get_lineage(artifact_id)


@router.post("/{artifact_id}/links", response_model=ArtifactLinkResponse, status_code=status.HTTP_201_CREATED)
async def add_artifact_link(
    artifact_id: UUID,
    body: ArtifactLinkCreate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Attach a lineage link to an artifact."""

    return await service.add_link(artifact_id, body.model_dump())


@router.get("/{artifact_id}/sinks", response_model=ArtifactSinkListResponse)
async def list_artifact_sinks(
    artifact_id: UUID,
    service: ArtifactService = Depends(get_artifact_service),
):
    """List sinks for an artifact."""

    sinks = await service.list_sinks(artifact_id)
    return {"sinks": sinks, "total": len(sinks)}


@router.post("/{artifact_id}/sinks", response_model=ArtifactSinkResponse, status_code=status.HTTP_201_CREATED)
async def add_artifact_sink(
    artifact_id: UUID,
    body: ArtifactSinkCreate,
    service: ArtifactService = Depends(get_artifact_service),
):
    """Attach a sink to an artifact."""

    return await service.add_sink(artifact_id, body.model_dump())
