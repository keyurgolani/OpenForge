"""Catalog domain API router - unified discovery and readiness checks."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openforge.db.postgres import get_db

from .schemas import CatalogListResponse, CatalogReadinessResponse, UnifiedCloneRequest
from .service import CatalogService
from .types import CatalogItemType

router = APIRouter()


def get_catalog_service(db=Depends(get_db)) -> CatalogService:
    """Dependency to get catalog service."""
    return CatalogService(db)


@router.get("", response_model=CatalogListResponse)
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


@router.post("/clone", status_code=status.HTTP_201_CREATED)
async def unified_clone(
    body: UnifiedCloneRequest,
    service: CatalogService = Depends(get_catalog_service),
):
    """Execute a full clone plan with dependency resolution in a single transaction."""
    return await service.execute_unified_clone(body.model_dump())


@router.get("/dependencies/{catalog_type}/{item_id}")
async def get_dependency_tree(
    catalog_type: str,
    item_id: UUID,
    service: CatalogService = Depends(get_catalog_service),
):
    """Resolve the full recursive dependency tree for a template."""
    tree = await service.get_dependency_tree(catalog_type, item_id)
    if tree is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return tree
