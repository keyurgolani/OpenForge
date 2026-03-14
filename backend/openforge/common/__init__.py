"""
Common utilities and shared code for OpenForge.

This package contains:
- config: Centralized configuration management
- errors: Shared exception types
- logging: Logging utilities (to be added)
- time: Time/date utilities (to be added)
- json: JSON utilities (to be added)
- ids: ID generation utilities (to be added)
- validation: Validation helpers (to be added)
"""

# Re-export commonly used items for convenience
from openforge.common.config import get_settings, Settings
from openforge.common.errors import (
    ConflictError,
    ConfigurationError,
    ExternalServiceError,
    ForbiddenError,
    LegacyModuleAccessError,
    NotFoundError,
    OpenForgeError,
    RuntimeUnavailableError,
    UnauthorizedError,
    ValidationError,
)

__all__ = [
    # Config
    "get_settings",
    "Settings",
    # Errors
    "ConflictError",
    "ConfigurationError",
    "ExternalServiceError",
    "ForbiddenError",
    "LegacyModuleAccessError",
    "NotFoundError",
    "OpenForgeError",
    "RuntimeUnavailableError",
    "UnauthorizedError",
    "ValidationError",
]
