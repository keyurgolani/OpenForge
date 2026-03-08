from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from openforge.db.postgres import get_db
from openforge.services.llm_service import llm_service
from openforge.schemas.llm import (
    LLMProviderCreate, LLMProviderUpdate, LLMProviderResponse,
    EndpointCreate, EndpointResponse,
    VirtualProviderCreate, VirtualProviderUpdate, VirtualProviderResponse,
    ModelInfo, ConnectionTestResult,
    EmbeddingConfigUpdate, EmbeddingConfigResponse,
)

router = APIRouter()


# ── Standard Providers ────────────────────────────────────────────────────────

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


@router.post("/providers/{provider_id}/sync-models", response_model=LLMProviderResponse)
async def sync_models(provider_id: UUID, body: dict, db: AsyncSession = Depends(get_db)):
    """Sync discovered models into the provider."""
    return await llm_service.sync_models(db, provider_id, body.get("models", []))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/endpoints", response_model=list[EndpointResponse])
async def list_endpoints(db: AsyncSession = Depends(get_db)):
    return await llm_service.list_endpoints(db)


@router.post("/endpoints", response_model=EndpointResponse, status_code=201)
async def create_endpoint(body: EndpointCreate, db: AsyncSession = Depends(get_db)):
    return await llm_service.create_endpoint(db, body)


@router.get("/endpoints/{endpoint_id}", response_model=EndpointResponse)
async def get_endpoint(endpoint_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.get_endpoint(db, endpoint_id)


@router.delete("/endpoints/{endpoint_id}", status_code=204)
async def delete_endpoint(endpoint_id: UUID, db: AsyncSession = Depends(get_db)):
    await llm_service.delete_endpoint(db, endpoint_id)


@router.put("/endpoints/{endpoint_id}/default/{purpose}", response_model=EndpointResponse)
async def set_default_endpoint(endpoint_id: UUID, purpose: str, db: AsyncSession = Depends(get_db)):
    """Set an endpoint as default for 'chat' or 'vision'."""
    return await llm_service.set_default_endpoint(db, endpoint_id, purpose)


# ── Virtual Providers ─────────────────────────────────────────────────────────

@router.get("/virtual-providers", response_model=list[VirtualProviderResponse])
async def list_virtual_providers(db: AsyncSession = Depends(get_db)):
    return await llm_service.list_virtual_providers(db)


@router.post("/virtual-providers", response_model=VirtualProviderResponse, status_code=201)
async def create_virtual_provider(body: VirtualProviderCreate, db: AsyncSession = Depends(get_db)):
    return await llm_service.create_virtual_provider(db, body)


@router.get("/virtual-providers/{vp_id}", response_model=VirtualProviderResponse)
async def get_virtual_provider(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    return await llm_service.get_virtual_provider(db, vp_id)


@router.put("/virtual-providers/{vp_id}", response_model=VirtualProviderResponse)
async def update_virtual_provider(vp_id: UUID, body: VirtualProviderUpdate, db: AsyncSession = Depends(get_db)):
    return await llm_service.update_virtual_provider(db, vp_id, body)


@router.delete("/virtual-providers/{vp_id}", status_code=204)
async def delete_virtual_provider(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    await llm_service.delete_virtual_provider(db, vp_id)


# ── Embedding Config ───────────────────────────────────────────────────────────

@router.get("/embedding-config", response_model=EmbeddingConfigResponse)
async def get_embedding_config(db: AsyncSession = Depends(get_db)):
    return await llm_service.get_embedding_config(db)


@router.put("/embedding-config", response_model=EmbeddingConfigResponse)
async def set_embedding_config(body: EmbeddingConfigUpdate, db: AsyncSession = Depends(get_db)):
    return await llm_service.set_embedding_config(db, body)


@router.post("/reindex-embeddings", response_model=dict)
async def reindex_all_embeddings(db: AsyncSession = Depends(get_db)):
    """Reset all knowledge items to pending embedding status, triggering full re-embedding."""
    return await llm_service.reindex_all_embeddings(db)
