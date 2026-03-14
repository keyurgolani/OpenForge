"""
Common ID utilities for OpenForge.

This module provides centralized ID generation and validation utilities
for consistent ID handling across the application.
"""

import uuid
from typing import Optional


def generate_id() -> str:
    """
    Generate a new unique ID.

    Returns:
        String representation of a UUID4
    """
    return str(uuid.uuid4())


def generate_short_id(length: int = 8) -> str:
    """
    Generate a short unique ID.

    Args:
        length: Length of the ID (default 8)

    Returns:
        Short unique ID string
    """
    return uuid.uuid4().hex[:length]


def validate_uuid(id_str: str) -> bool:
    """
    Validate if a string is a valid UUID.

    Args:
        id_str: String to validate

    Returns:
        True if valid UUID, False otherwise
    """
    try:
        uuid.UUID(id_str)
        return True
    except (ValueError, AttributeError):
        return False


def parse_uuid(id_str: str) -> Optional[uuid.UUID]:
    """
    Parse a string to UUID.

    Args:
        id_str: String to parse

    Returns:
        UUID object or None if invalid
    """
    try:
        return uuid.UUID(id_str)
    except (ValueError, AttributeError):
        return None


def slugify(text: str, max_length: int = 50) -> str:
    """
    Convert text to a URL-friendly slug.

    Args:
        text: Text to slugify
        max_length: Maximum length of the slug

    Returns:
        URL-friendly slug
    """
    import re

    # Convert to lowercase and replace spaces/special chars with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower())
    # Remove leading/trailing hyphens
    slug = slug.strip("-")
    # Truncate to max length
    return slug[:max_length]
