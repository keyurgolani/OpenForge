"""API endpoints for memory system settings."""

from fastapi import APIRouter
from pydantic import BaseModel
from openforge.common.config import get_settings

router = APIRouter()


class MemorySettingsResponse(BaseModel):
    enabled: bool
    consolidation_interval: int
    short_term_retention_days: int
    invalidated_retention_days: int
    recall_promotion_threshold: int
    entity_extraction_llm_fallback: bool
    mirror_enabled: bool
    mirror_path: str
    neo4j_url: str


@router.get("/settings", response_model=MemorySettingsResponse)
async def get_memory_settings():
    settings = get_settings()
    return MemorySettingsResponse(
        enabled=settings.memory_enabled,
        consolidation_interval=settings.memory_consolidation_interval,
        short_term_retention_days=settings.memory_short_term_retention_days,
        invalidated_retention_days=settings.memory_invalidated_retention_days,
        recall_promotion_threshold=settings.memory_recall_promotion_threshold,
        entity_extraction_llm_fallback=settings.memory_entity_extraction_llm_fallback,
        mirror_enabled=settings.memory_mirror_enabled,
        mirror_path=settings.memory_mirror_path,
        neo4j_url=settings.neo4j_url,
    )
