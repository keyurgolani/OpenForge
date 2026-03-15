"""Model Policy domain router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from .schemas import (
    ModelPolicyCreate,
    ModelPolicyUpdate,
    ModelPolicyResponse,
    ModelPolicyListResponse,
)
from .service import ModelPolicyService

router = APIRouter()


def get_service(db: AsyncSession = Depends(get_db)) -> ModelPolicyService:
    return ModelPolicyService(db)


@router.get("", response_model=ModelPolicyListResponse)
async def list_model_policies(
    skip: int = 0,
    limit: int = 100,
    service: ModelPolicyService = Depends(get_service),
):
    """List all model policies."""
    policies, total = await service.list_policies(skip=skip, limit=limit)
    return ModelPolicyListResponse(
        policies=[ModelPolicyResponse(**p) for p in policies],
        total=total,
    )


@router.get("/{policy_id}", response_model=ModelPolicyResponse)
async def get_model_policy(
    policy_id: str,
    service: ModelPolicyService = Depends(get_service),
):
    """Get a specific model policy by ID."""
    policy = await service.get_policy(policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Model policy not found")
    return ModelPolicyResponse(**policy)


@router.post("", response_model=ModelPolicyResponse, status_code=201)
async def create_model_policy(
    policy_data: ModelPolicyCreate,
    service: ModelPolicyService = Depends(get_service),
):
    """Create a new model policy."""
    policy = await service.create_policy(policy_data.model_dump(exclude_unset=True))
    return ModelPolicyResponse(**policy)


@router.patch("/{policy_id}", response_model=ModelPolicyResponse)
async def update_model_policy(
    policy_id: str,
    policy_data: ModelPolicyUpdate,
    service: ModelPolicyService = Depends(get_service),
):
    """Update an existing model policy."""
    policy = await service.update_policy(
        policy_id, policy_data.model_dump(exclude_unset=True, exclude_none=True)
    )
    if policy is None:
        raise HTTPException(status_code=404, detail="Model policy not found")
    return ModelPolicyResponse(**policy)


@router.delete("/{policy_id}", status_code=204)
async def delete_model_policy(
    policy_id: str,
    service: ModelPolicyService = Depends(get_service),
):
    """Delete a model policy."""
    deleted = await service.delete_policy(policy_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model policy not found")
