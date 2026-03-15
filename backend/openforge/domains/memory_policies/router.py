"""Memory Policy domain router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from .schemas import (
    MemoryPolicyCreate,
    MemoryPolicyUpdate,
    MemoryPolicyResponse,
    MemoryPolicyListResponse,
)
from .service import MemoryPolicyService

router = APIRouter()


def get_service(db: AsyncSession = Depends(get_db)) -> MemoryPolicyService:
    return MemoryPolicyService(db)


@router.get("", response_model=MemoryPolicyListResponse)
async def list_memory_policies(
    skip: int = 0,
    limit: int = 100,
    service: MemoryPolicyService = Depends(get_service),
):
    """List all memory policies."""
    policies, total = await service.list_policies(skip=skip, limit=limit)
    return MemoryPolicyListResponse(
        policies=[MemoryPolicyResponse(**p) for p in policies],
        total=total,
    )


@router.get("/{policy_id}", response_model=MemoryPolicyResponse)
async def get_memory_policy(
    policy_id: str,
    service: MemoryPolicyService = Depends(get_service),
):
    """Get a specific memory policy by ID."""
    policy = await service.get_policy(policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Memory policy not found")
    return MemoryPolicyResponse(**policy)


@router.post("", response_model=MemoryPolicyResponse, status_code=201)
async def create_memory_policy(
    policy_data: MemoryPolicyCreate,
    service: MemoryPolicyService = Depends(get_service),
):
    """Create a new memory policy."""
    policy = await service.create_policy(policy_data.model_dump(exclude_unset=True))
    return MemoryPolicyResponse(**policy)


@router.patch("/{policy_id}", response_model=MemoryPolicyResponse)
async def update_memory_policy(
    policy_id: str,
    policy_data: MemoryPolicyUpdate,
    service: MemoryPolicyService = Depends(get_service),
):
    """Update an existing memory policy."""
    policy = await service.update_policy(
        policy_id, policy_data.model_dump(exclude_unset=True, exclude_none=True)
    )
    if policy is None:
        raise HTTPException(status_code=404, detail="Memory policy not found")
    return MemoryPolicyResponse(**policy)


@router.delete("/{policy_id}", status_code=204)
async def delete_memory_policy(
    policy_id: str,
    service: MemoryPolicyService = Depends(get_service),
):
    """Delete a memory policy."""
    deleted = await service.delete_policy(policy_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory policy not found")
