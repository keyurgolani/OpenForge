"""Output domain API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db

from .schemas import (
    OutputCreate,
    OutputDiffResponse,
    OutputLineageResponse,
    OutputLinkCreate,
    OutputLinkResponse,
    OutputListResponse,
    OutputResponse,
    OutputSinkCreate,
    OutputSinkListResponse,
    OutputSinkResponse,
    OutputUpdate,
    OutputVersionCreate,
    OutputVersionListResponse,
    OutputVersionResponse,
)
from .service import OutputService

router = APIRouter()


def get_output_service(db=Depends(get_db)) -> OutputService:
    """Dependency to get output service."""

    return OutputService(db)


@router.get("", response_model=OutputListResponse)
async def list_outputs(
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
    service: OutputService = Depends(get_output_service),
):
    """List outputs with filtering."""

    try:
        outputs, total = await service.list_outputs(
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
        outputs, total = await service.list_outputs(skip=skip, limit=limit, workspace_id=workspace_id)
    return {"outputs": outputs, "total": total}


@router.get("/{output_id}", response_model=OutputResponse)
async def get_output(
    output_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """Get an output by ID."""

    output = await service.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    return output


@router.post("", response_model=OutputResponse, status_code=status.HTTP_201_CREATED)
async def create_output(
    output_data: OutputCreate,
    service: OutputService = Depends(get_output_service),
):
    """Create a new output with an initial version."""

    return await service.create_output(output_data.model_dump())


@router.patch("/{output_id}", response_model=OutputResponse)
async def update_output(
    output_id: UUID,
    output_data: OutputUpdate,
    service: OutputService = Depends(get_output_service),
):
    """Update output metadata or append a new version."""

    output = await service.update_output(output_id, output_data.model_dump(exclude_unset=True))
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    return output


@router.delete("/{output_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_output(
    output_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """Soft-delete an output."""

    success = await service.delete_output(output_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    return None


@router.get("/{output_id}/versions", response_model=OutputVersionListResponse)
async def list_output_versions(
    output_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """List versions for an output."""

    versions = await service.list_versions(output_id)
    return {"versions": versions, "total": len(versions)}


@router.get("/{output_id}/versions/{version_id}", response_model=OutputVersionResponse)
async def get_output_version(
    output_id: UUID,
    version_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """Get a specific output version."""

    version = await service.get_version(output_id, version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output version not found")
    return version


@router.post("/{output_id}/versions", response_model=OutputResponse, status_code=status.HTTP_201_CREATED)
async def create_output_version(
    output_id: UUID,
    body: OutputVersionCreate,
    service: OutputService = Depends(get_output_service),
):
    """Create and promote a new output version."""

    output = await service.create_version(output_id, body.model_dump())
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    return output


@router.post("/{output_id}/versions/{version_id}/promote", response_model=OutputResponse)
async def promote_output_version(
    output_id: UUID,
    version_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """Promote an existing version to current."""

    output = await service.promote_version(output_id, version_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output or version not found")
    return output


@router.get("/{output_id}/versions/{version_id}/diff", response_model=OutputDiffResponse)
async def get_output_version_diff(
    output_id: UUID,
    version_id: UUID,
    compare_to_version_id: UUID = Query(...),
    service: OutputService = Depends(get_output_service),
):
    """Get a first-pass diff summary between two versions."""

    diff = await service.get_version_diff_summary(output_id, version_id, compare_to_version_id)
    if not diff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output version diff not found")
    return diff


@router.get("/{output_id}/lineage", response_model=OutputLineageResponse)
async def get_output_lineage(
    output_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """Get grouped lineage for an output."""

    return await service.get_lineage(output_id)


@router.post("/{output_id}/links", response_model=OutputLinkResponse, status_code=status.HTTP_201_CREATED)
async def add_output_link(
    output_id: UUID,
    body: OutputLinkCreate,
    service: OutputService = Depends(get_output_service),
):
    """Attach a lineage link to an output."""

    return await service.add_link(output_id, body.model_dump())


@router.get("/{output_id}/sinks", response_model=OutputSinkListResponse)
async def list_output_sinks(
    output_id: UUID,
    service: OutputService = Depends(get_output_service),
):
    """List sinks for an output."""

    sinks = await service.list_sinks(output_id)
    return {"sinks": sinks, "total": len(sinks)}


@router.post("/{output_id}/sinks", response_model=OutputSinkResponse, status_code=status.HTTP_201_CREATED)
async def add_output_sink(
    output_id: UUID,
    body: OutputSinkCreate,
    service: OutputService = Depends(get_output_service),
):
    """Attach a sink to an output."""

    return await service.add_sink(output_id, body.model_dump())
