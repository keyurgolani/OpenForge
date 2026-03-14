"""
Shared exception types for OpenForge.

This module provides standardized exception classes that should be used
throughout the application for consistent error handling.

Usage:
    from openforge.common.errors import NotFoundError, ValidationError

    raise NotFoundError("Profile", profile_id)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID


class OpenForgeError(Exception):
    """Base exception for all OpenForge errors."""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def __str__(self) -> str:
        return self.message


class NotFoundError(OpenForgeError):
    """Raised when a requested resource is not found."""

    def __init__(
        self,
        resource_type: str,
        resource_id: str | UUID | None = None,
        message: str | None = None,
    ):
        if message is None:
            if resource_id:
                message = f"{resource_type} with id '{resource_id}' not found"
            else:
                message = f"{resource_type} not found"
        super().__init__(message, {"resource_type": resource_type, "resource_id": str(resource_id) if resource_id else None})
        self.resource_type = resource_type
        self.resource_id = resource_id


class ValidationError(OpenForgeError):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str,
        field: str | None = None,
        value: Any = None,
        errors: list[dict[str, Any]] | None = None,
    ):
        details = {}
        if field:
            details["field"] = field
        if value is not None:
            details["value"] = str(value)
        if errors:
            details["errors"] = errors
        super().__init__(message, details)
        self.field = field
        self.value = value
        self.errors = errors


class ConflictError(OpenForgeError):
    """Raised when a resource conflict occurs (e.g., duplicate entry)."""

    def __init__(
        self,
        message: str,
        resource_type: str | None = None,
        conflicting_field: str | None = None,
    ):
        details = {}
        if resource_type:
            details["resource_type"] = resource_type
        if conflicting_field:
            details["conflicting_field"] = conflicting_field
        super().__init__(message, details)
        self.resource_type = resource_type
        self.conflicting_field = conflicting_field


class ForbiddenError(OpenForgeError):
    """Raised when access to a resource is forbidden."""

    def __init__(
        self,
        message: str = "Access forbidden",
        resource_type: str | None = None,
        action: str | None = None,
    ):
        details = {}
        if resource_type:
            details["resource_type"] = resource_type
        if action:
            details["action"] = action
        super().__init__(message, details)
        self.resource_type = resource_type
        self.action = action


class UnauthorizedError(OpenForgeError):
    """Raised when authentication is required or failed."""

    def __init__(self, message: str = "Authentication required"):
        super().__init__(message)


class RuntimeUnavailableError(OpenForgeError):
    """Raised when a runtime resource is unavailable."""

    def __init__(
        self,
        resource_name: str,
        message: str | None = None,
    ):
        if message is None:
            message = f"Runtime resource '{resource_name}' is unavailable"
        super().__init__(message, {"resource_name": resource_name})
        self.resource_name = resource_name


class LegacyModuleAccessError(OpenForgeError):
    """Raised when attempting to access a deprecated legacy module from non-legacy code."""

    def __init__(
        self,
        module_name: str,
        replacement: str | None = None,
        message: str | None = None,
    ):
        if message is None:
            message = f"Legacy module '{module_name}' should not be imported from non-legacy code"
            if replacement:
                message += f". Use '{replacement}' instead"
        super().__init__(message, {"module_name": module_name, "replacement": replacement})
        self.module_name = module_name
        self.replacement = replacement


class ConfigurationError(OpenForgeError):
    """Raised when configuration is invalid or missing."""

    def __init__(
        self,
        setting_name: str,
        message: str | None = None,
        expected_format: str | None = None,
    ):
        if message is None:
            message = f"Invalid or missing configuration for '{setting_name}'"
            if expected_format:
                message += f". Expected format: {expected_format}"
        super().__init__(message, {"setting_name": setting_name, "expected_format": expected_format})
        self.setting_name = setting_name
        self.expected_format = expected_format


class ExternalServiceError(OpenForgeError):
    """Raised when an external service call fails."""

    def __init__(
        self,
        service_name: str,
        message: str | None = None,
        original_error: Exception | None = None,
    ):
        if message is None:
            message = f"External service '{service_name}' error"
        details = {"service_name": service_name}
        if original_error:
            details["original_error"] = str(original_error)
        super().__init__(message, details)
        self.service_name = service_name
        self.original_error = original_error
