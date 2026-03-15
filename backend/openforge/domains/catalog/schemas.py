"""Catalog domain schemas for API request/response models."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from .types import CatalogItemType


class CatalogItemResponse(BaseModel):
    """Unified catalog item response for cross-type browsing."""

    id: UUID
    catalog_type: CatalogItemType
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    is_featured: bool = False
    is_recommended: bool = False
    sort_priority: int = 0
    # Catalog-specific metadata
    difficulty_level: Optional[str] = None
    setup_complexity: Optional[str] = None
    autonomy_level: Optional[str] = None
    recommended_use_cases: list[str] = Field(default_factory=list)
    expected_outputs: list[str] = Field(default_factory=list)
    example_inputs: list[str] = Field(default_factory=list)
    clone_behavior: str = "clone_only"
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CatalogListResponse(BaseModel):
    """Paginated catalog listing response."""

    items: list[CatalogItemResponse]
    total: int


class CatalogReadinessResponse(BaseModel):
    """Readiness check for a catalog template."""

    catalog_type: CatalogItemType
    item_id: UUID
    is_ready: bool = True
    missing_dependencies: list[str] = Field(default_factory=list)
    setup_requirements: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
