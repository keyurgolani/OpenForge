"""
Common validation utilities for OpenForge.

This module provides centralized validation utilities
for consistent data validation across the application.
"""

import re
from typing import Any, Optional
from uuid import UUID


def validate_email(email: str) -> bool:
    """
    Validate an email address.

    Args:
        email: Email address to validate

    Returns:
        True if valid email, False otherwise
    """
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def validate_url(url: str) -> bool:
    """
    Validate a URL.

    Args:
        url: URL to validate

    Returns:
        True if valid URL, False otherwise
    """
    pattern = r"^https?://[^\s/$.?#].[^\s]*$"
    return bool(re.match(pattern, url))


def validate_uuid(value: Any) -> bool:
    """
    Validate if a value is a valid UUID.

    Args:
        value: Value to validate

    Returns:
        True if valid UUID, False otherwise
    """
    if isinstance(value, UUID):
        return True
    if isinstance(value, str):
        try:
            UUID(value)
            return True
        except ValueError:
            return False
    return False


def validate_non_empty_string(value: Any, field_name: str = "field") -> str:
    """
    Validate that a value is a non-empty string.

    Args:
        value: Value to validate
        field_name: Name of the field for error messages

    Returns:
        Validated string

    Raises:
        ValueError: If value is not a non-empty string
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")
    return value.strip()


def validate_positive_integer(value: Any, field_name: str = "field") -> int:
    """
    Validate that a value is a positive integer.

    Args:
        value: Value to validate
        field_name: Name of the field for error messages

    Returns:
        Validated integer

    Raises:
        ValueError: If value is not a positive integer
    """
    if not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} must be a positive integer")
    return value


def validate_optional_string(value: Any, field_name: str = "field") -> Optional[str]:
    """
    Validate that a value is either None or a non-empty string.

    Args:
        value: Value to validate
        field_name: Name of the field for error messages

    Returns:
        Validated string or None

    Raises:
        ValueError: If value is not None or a non-empty string
    """
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be None or a non-empty string")
    return value.strip()
