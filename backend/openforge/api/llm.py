"""LLM provider management API."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.schemas.llm import (
    ConnectionTestResult,
    LLMProviderCreate,
    LLMProviderResponse,
    LLMProviderUpdate,
    ModelInfo,
)
from openforge.services.llm_service import llm_service

router = APIRouter()


@router.get("/providers", response_model=list[LLMProviderResponse])
async def list_providers(db: AsyncSession = Depends(get_db)):
    return await llm_service.list_providers(db)


@router.post("/providers", response_model=LLMProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(body: LLMProviderCreate, db: AsyncSession = Depends(get_db)):
    return await llm_service.create_provider(db, body)


@router.get("/providers/{provider_id}", response_model=LLMProviderResponse)
async def get_provider(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.get_provider(db, provider_id)


@router.put("/providers/{provider_id}", response_model=LLMProviderResponse)
async def update_provider(
    provider_id: UUID,
    body: LLMProviderUpdate,
    db: AsyncSession = Depends(get_db),
):
    # For system providers, prevent changing provider_name via the update schema.
    # (LLMProviderUpdate currently does not expose provider_name, but guard explicitly
    # in case the schema is extended later.)
    provider_resp = await llm_service.get_provider(db, provider_id)
    if provider_resp.is_system and getattr(body, "provider_name", None) is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot change provider_name on a system provider",
        )
    return await llm_service.update_provider(db, provider_id, body)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    # Prevent deletion of system providers
    provider_resp = await llm_service.get_provider(db, provider_id)
    if provider_resp.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system provider")
    await llm_service.delete_provider(db, provider_id)
    return None


@router.get("/providers/{provider_id}/models", response_model=list[ModelInfo])
async def list_provider_models(
    provider_id: UUID,
    capability_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    # For the openforge-local provider, return the unified catalog (Ollama + local)
    from openforge.services.local_models import LOCAL_PROVIDER_NAME
    provider_resp = await llm_service.get_provider(db, provider_id)
    if provider_resp.provider_name == LOCAL_PROVIDER_NAME:
        from openforge.services.local_models import get_unified_models
        unified = await get_unified_models(capability_type)
        return [ModelInfo(**m) for m in unified]
    return await llm_service.list_models(db, provider_id)


@router.post("/providers/{provider_id}/test", response_model=ConnectionTestResult)
async def test_provider(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.test_connection(db, provider_id)


@router.put("/providers/{provider_id}/default", response_model=LLMProviderResponse)
async def set_default_provider(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.set_default_provider(db, provider_id)
