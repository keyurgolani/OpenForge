"""Catalog domain API router - unified discovery and readiness checks."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from openforge.db.postgres import get_db

from .schemas import CatalogListResponse, CatalogReadinessResponse
from .service import CatalogService
from .types import CatalogItemType

router = APIRouter()


def get_catalog_service(db=Depends(get_db)) -> CatalogService:
    """Dependency to get catalog service."""
    return CatalogService(db)


@router.get("/", response_model=CatalogListResponse)
async def list_catalog(
    skip: int = 0,
    limit: int = 100,
    catalog_type: CatalogItemType | None = None,
    is_featured: bool | None = None,
    tags: list[str] = Query(default=[]),
    service: CatalogService = Depends(get_catalog_service),
):
    """Browse the curated catalog across profiles, workflows, and missions."""
    items, total = await service.list_catalog(
        skip=skip,
        limit=limit,
        catalog_type=catalog_type,
        is_featured=is_featured or None,
        tags=tags or None,
    )
    return {"items": items, "total": total}


@router.get("/readiness/{catalog_type}/{item_id}", response_model=CatalogReadinessResponse)
async def check_catalog_readiness(
    catalog_type: CatalogItemType,
    item_id: UUID,
    service: CatalogService = Depends(get_catalog_service),
):
    """Check whether a catalog template is ready to be cloned or used."""
    return await service.check_readiness(catalog_type, item_id)
