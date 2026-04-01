"""Sink domain API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db

from .schemas import (
    SinkCreate,
    SinkListResponse,
    SinkResponse,
    SinkUpdate,
)
from .service import SinkService

router = APIRouter()


def get_sink_service(db=Depends(get_db)) -> SinkService:
    return SinkService(db)


def _sink_to_response(sink) -> dict:
    """Convert a SinkModel to a response dict."""
    return {
        "id": sink.id,
        "name": sink.name,
        "slug": sink.slug,
        "description": sink.description,
        "sink_type": sink.sink_type,
        "config": sink.config or {},
        "icon": sink.icon,
        "tags": sink.tags_json or [],
        "created_at": sink.created_at,
        "updated_at": sink.updated_at,
    }


@router.get("", response_model=SinkListResponse)
async def list_sinks(
    sink_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: SinkService = Depends(get_sink_service),
):
    """List all sink definitions with optional filtering."""
    sinks, total = await service.list_sinks(
        sink_type=sink_type, q=q, limit=limit, offset=offset,
    )
    return SinkListResponse(
        sinks=[SinkResponse(**_sink_to_response(s)) for s in sinks],
        total=total,
    )


@router.get("/{sink_id}", response_model=SinkResponse)
async def get_sink(
    sink_id: UUID,
    service: SinkService = Depends(get_sink_service),
):
    """Get a single sink definition by ID."""
    sink = await service.get_sink(sink_id)
    if sink is None:
        raise HTTPException(status_code=404, detail="Sink not found")
    return SinkResponse(**_sink_to_response(sink))


@router.post("", response_model=SinkResponse, status_code=status.HTTP_201_CREATED)
async def create_sink(
    body: SinkCreate,
    service: SinkService = Depends(get_sink_service),
):
    """Create a new sink definition."""
    sink = await service.create_sink(body.model_dump())
    return SinkResponse(**_sink_to_response(sink))


@router.patch("/{sink_id}", response_model=SinkResponse)
async def update_sink(
    sink_id: UUID,
    body: SinkUpdate,
    service: SinkService = Depends(get_sink_service),
):
    """Update a sink definition."""
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    sink = await service.update_sink(sink_id, update_data)
    if sink is None:
        raise HTTPException(status_code=404, detail="Sink not found")
    return SinkResponse(**_sink_to_response(sink))


@router.delete("/{sink_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sink(
    sink_id: UUID,
    service: SinkService = Depends(get_sink_service),
):
    """Delete a sink definition."""
    deleted = await service.delete_sink(sink_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sink not found")
