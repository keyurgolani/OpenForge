"""
Run domain API router.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.openforge.db.session import get_db

from .schemas import RunCreate, RunResponse, RunUpdate
from .service import RunService

router = APIRouter()


def get_run_service(db: AsyncSession = Depends(get_db)) -> RunService:
    """Dependency to get run service."""
    return RunService(db)


@router.get("/", response_model=dict)
async def list_runs(
    skip: int = 0,
    limit: int = 100,
    service: RunService = Depends(get_run_service),
):
    """List all runs."""
    runs, total = await service.list_runs(skip=skip, limit=limit)
    return {"runs": runs, "total": total}


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: UUID,
    service: RunService = Depends(get_run_service),
):
    """Get a run by ID."""
    run = await service.get_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found",
        )
    return run


@router.post("/", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    run_data: RunCreate,
    service: RunService = Depends(get_run_service),
):
    """Create a new run."""
    run = await service.create_run(run_data.model_dump())
    return run


@router.patch("/{run_id}", response_model=RunResponse)
async def update_run(
    run_id: UUID,
    run_data: RunUpdate,
    service: RunService = Depends(get_run_service),
):
    """Update a run."""
    run = await service.update_run(run_id, run_data.model_dump(exclude_unset=True))
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found",
        )
    return run
