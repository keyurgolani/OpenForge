"""
Base models and mixins for domain entities.

These provide reusable fields and patterns for all domain models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class TimestampMixin(BaseModel):
    """Mixin for timestamp fields."""
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AuditMixin(TimestampMixin):
    """Mixin for audit fields including user tracking."""
    
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)


class SoftDeleteMixin(BaseModel):
    """Mixin for soft delete capability."""
    
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = Field(default=None)
    deleted_by: Optional[UUID] = Field(default=None)


class BaseEntity(AuditMixin, SoftDeleteMixin):
    """
    Base entity with common fields for all domain entities.
    
    Includes:
    - UUID primary key
    - Timestamps (created_at, updated_at)
    - User tracking (created_by, updated_by)
    - Soft delete support (is_deleted, deleted_at, deleted_by)
    """
    
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
