from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from openforge.db.postgres import get_db
from openforge.services.llm_service import llm_service
from openforge.schemas.llm import (
    LLMProviderCreate, LLMProviderUpdate, LLMProviderResponse,
    ModelInfo, ConnectionTestResult
)

router = APIRouter()


@router.get("/providers", response_model=list[LLMProviderResponse])
async def list_providers(db: AsyncSession = Depends(get_db)):
    return await llm_service.list_providers(db)


@router.post("/providers", response_model=LLMProviderResponse, status_code=201)
async def create_provider(body: LLMProviderCreate, db: AsyncSession = Depends(get_db)):
    return await llm_service.create_provider(db, body)


@router.put("/providers/{provider_id}", response_model=LLMProviderResponse)
async def update_provider(
    provider_id: UUID, body: LLMProviderUpdate, db: AsyncSession = Depends(get_db)
):
    return await llm_service.update_provider(db, provider_id, body)


@router.delete("/providers/{provider_id}", status_code=204)
async def delete_provider(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    await llm_service.delete_provider(db, provider_id)


@router.get("/providers/{provider_id}/models", response_model=list[ModelInfo])
async def list_models(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.list_models(db, provider_id)


@router.post("/providers/{provider_id}/test", response_model=ConnectionTestResult)
async def test_connection(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.test_connection(db, provider_id)


@router.put("/providers/{provider_id}/default", response_model=LLMProviderResponse)
async def set_default(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.set_default_provider(db, provider_id)
