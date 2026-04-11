"""API endpoints for the memory system."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from openforge.db.postgres import get_db
from .schemas import (
    MemoryCreate, MemoryResponse, MemoryRecallRequest,
    MemoryRecallResult, MemoryForgetRequest,
)
from .service import MemoryService

router = APIRouter()


def get_memory_service(db: AsyncSession = Depends(get_db)) -> MemoryService:
    return MemoryService(db)


@router.post("/store", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def store_memory(
    data: MemoryCreate,
    service: MemoryService = Depends(get_memory_service),
):
    memory = await service.store(
        content=data.content,
        source_type="agent",
        memory_type=data.memory_type,
        confidence=data.confidence,
        tags=data.tags,
        workspace_id=data.workspace_id,
        knowledge_id=data.knowledge_id,
        source_agent_id=data.source_agent_id,
        source_run_id=data.source_run_id,
        source_conversation_id=data.source_conversation_id,
    )
    return memory


@router.post("/recall", response_model=list[MemoryRecallResult])
async def recall_memory(
    data: MemoryRecallRequest,
    db: AsyncSession = Depends(get_db),
):
    from openforge.memory.retrieval import recall
    results = await recall(
        query=data.query,
        db=db,
        workspace_id=data.workspace_id,
        memory_type=data.memory_type,
        tags=data.tags,
        deep=data.deep,
        limit=data.limit,
    )
    return results


@router.post("/forget", status_code=status.HTTP_204_NO_CONTENT)
async def forget_memory(
    data: MemoryForgetRequest,
    service: MemoryService = Depends(get_memory_service),
):
    success = await service.forget(data.memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found or already invalidated")
    return None


@router.get("/manifest", response_model=list[dict])
async def get_manifest(
    service: MemoryService = Depends(get_memory_service),
):
    return await service.get_l1_manifest()
