"""
Error types package for OpenForge.

This package provides centralized exception definitions.
All modules should use these exception types for consistent error handling.

Usage:
    from openforge.common.errors import NotFoundError, ValidationError
"""

from openforge.common.errors.exceptions import (
    ConflictError,
    ConfigurationError,
    ExternalServiceError,
    ForbiddenError,
    NotFoundError,
    OpenForgeError,
    RuntimeUnavailableError,
    UnauthorizedError,
    ValidationError,
)

__all__ = [
    "ConflictError",
    "ConfigurationError",
    "ExternalServiceError",
    "ForbiddenError",
    "NotFoundError",
    "OpenForgeError",
    "RuntimeUnavailableError",
    "UnauthorizedError",
    "ValidationError",
]
