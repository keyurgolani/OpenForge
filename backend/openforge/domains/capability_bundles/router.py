"""Capability Bundle domain router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from .schemas import (
    CapabilityBundleCreate,
    CapabilityBundleUpdate,
    CapabilityBundleResponse,
    CapabilityBundleListResponse,
)
from .service import CapabilityBundleService

router = APIRouter()


def get_service(db: AsyncSession = Depends(get_db)) -> CapabilityBundleService:
    return CapabilityBundleService(db)


@router.get("", response_model=CapabilityBundleListResponse)
async def list_capability_bundles(
    skip: int = 0,
    limit: int = 100,
    service: CapabilityBundleService = Depends(get_service),
):
    """List all capability bundles."""
    bundles, total = await service.list_bundles(skip=skip, limit=limit)
    return CapabilityBundleListResponse(
        bundles=[CapabilityBundleResponse(**b) for b in bundles],
        total=total,
    )


@router.get("/{bundle_id}", response_model=CapabilityBundleResponse)
async def get_capability_bundle(
    bundle_id: str,
    service: CapabilityBundleService = Depends(get_service),
):
    """Get a specific capability bundle by ID."""
    bundle = await service.get_bundle(bundle_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Capability bundle not found")
    return CapabilityBundleResponse(**bundle)


@router.post("", response_model=CapabilityBundleResponse, status_code=201)
async def create_capability_bundle(
    bundle_data: CapabilityBundleCreate,
    service: CapabilityBundleService = Depends(get_service),
):
    """Create a new capability bundle."""
    bundle = await service.create_bundle(bundle_data.model_dump(exclude_unset=True))
    return CapabilityBundleResponse(**bundle)


@router.patch("/{bundle_id}", response_model=CapabilityBundleResponse)
async def update_capability_bundle(
    bundle_id: str,
    bundle_data: CapabilityBundleUpdate,
    service: CapabilityBundleService = Depends(get_service),
):
    """Update an existing capability bundle."""
    bundle = await service.update_bundle(
        bundle_id, bundle_data.model_dump(exclude_unset=True, exclude_none=True)
    )
    if bundle is None:
        raise HTTPException(status_code=404, detail="Capability bundle not found")
    return CapabilityBundleResponse(**bundle)


@router.delete("/{bundle_id}", status_code=204)
async def delete_capability_bundle(
    bundle_id: str,
    service: CapabilityBundleService = Depends(get_service),
):
    """Delete a capability bundle."""
    deleted = await service.delete_bundle(bundle_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Capability bundle not found")
