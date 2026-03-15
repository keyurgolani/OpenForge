"""
Profile domain API router.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import (
    ProfileComparisonResponse,
    ProfileCreate,
    ProfileListResponse,
    ProfileResponse,
    ProfileUpdate,
    ProfileValidationResponse,
    ResolvedProfileResponse,
)
from .service import ProfileService

router = APIRouter()


def get_profile_service(db=Depends(get_db)) -> ProfileService:
    """Dependency to get profile service."""
    return ProfileService(db)


@router.get("/", response_model=ProfileListResponse)
async def list_profiles(
    skip: int = 0,
    limit: int = 100,
    service: ProfileService = Depends(get_profile_service),
):
    """List all profiles."""
    profiles, total = await service.list_profiles(skip=skip, limit=limit)
    return {"profiles": profiles, "total": total}


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(
    profile_id: UUID,
    service: ProfileService = Depends(get_profile_service),
):
    """Get a profile by ID."""
    profile = await service.get_profile(profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.get("/{profile_id}/resolve", response_model=ResolvedProfileResponse)
async def resolve_profile(
    profile_id: UUID,
    service: ProfileService = Depends(get_profile_service),
):
    """Resolve a profile into its effective bundles, policies, and runtime defaults."""
    profile = await service.resolve_profile(profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.get("/{profile_id}/validate", response_model=ProfileValidationResponse)
async def validate_profile(
    profile_id: UUID,
    service: ProfileService = Depends(get_profile_service),
):
    """Validate whether a profile has all required modular building blocks attached."""
    validation = await service.validate_profile_completeness(profile_id)
    if not validation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return validation


@router.get("/compare/{left_profile_id}/{right_profile_id}", response_model=ProfileComparisonResponse)
async def compare_profiles(
    left_profile_id: UUID,
    right_profile_id: UUID,
    service: ProfileService = Depends(get_profile_service),
):
    """Compare two profiles field-by-field."""
    comparison = await service.compare_profiles(left_profile_id, right_profile_id)
    if not comparison:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both profiles were not found",
        )
    return comparison


@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    profile_data: ProfileCreate,
    service: ProfileService = Depends(get_profile_service),
):
    """Create a new profile."""
    profile = await service.create_profile(profile_data.model_dump())
    return profile


@router.patch("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: UUID,
    profile_data: ProfileUpdate,
    service: ProfileService = Depends(get_profile_service),
):
    """Update a profile."""
    profile = await service.update_profile(profile_id, profile_data.model_dump(exclude_unset=True))
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: UUID,
    service: ProfileService = Depends(get_profile_service),
):
    """Delete a profile."""
    success = await service.delete_profile(profile_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return None
