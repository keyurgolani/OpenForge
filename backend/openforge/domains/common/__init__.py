"""
Common domain types and utilities.

This module provides shared types, enums, base models, and error classes
used across all domain packages.
"""

from .enums import (
    DomainStatus,
    ExecutionStatus,
    ExecutionMode,
    TriggerType,
    ArtifactType,
    Visibility,
    OwnershipSource,
)
from .base_models import (
    TimestampMixin,
    AuditMixin,
    SoftDeleteMixin,
    BaseEntity,
)
from .errors import (
    DomainError,
    EntityNotFoundError,
    EntityAlreadyExistsError,
    ValidationError,
    PermissionDeniedError,
)

__all__ = [
    # Enums
    "DomainStatus",
    "ExecutionStatus",
    "ExecutionMode",
    "TriggerType",
    "ArtifactType",
    "Visibility",
    "OwnershipSource",
    # Base models
    "TimestampMixin",
    "AuditMixin",
    "SoftDeleteMixin",
    "BaseEntity",
    # Errors
    "DomainError",
    "EntityNotFoundError",
    "EntityAlreadyExistsError",
    "ValidationError",
    "PermissionDeniedError",
]
