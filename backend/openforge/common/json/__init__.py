"""
Common JSON utilities for OpenForge.

This module provides centralized JSON handling utilities
for consistent JSON serialization/deserialization across the application.
"""

import json
from datetime import datetime
from typing import Any, Optional
from uuid import UUID


class OpenForgeJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for OpenForge types."""

    def default(self, obj: Any) -> Any:
        """
        Convert objects to JSON-serializable format.

        Args:
            obj: Object to serialize

        Returns:
            JSON-serializable representation
        """
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return super().default(obj)


def to_json(obj: Any, indent: Optional[int] = None) -> str:
    """
    Convert an object to JSON string.

    Args:
        obj: Object to serialize
        indent: Optional indentation level

    Returns:
        JSON string
    """
    return json.dumps(obj, cls=OpenForgeJSONEncoder, indent=indent)


def from_json(json_str: str) -> Any:
    """
    Parse a JSON string.

    Args:
        json_str: JSON string to parse

    Returns:
        Parsed object
    """
    return json.loads(json_str)


def safe_json_dict(data: dict[str, Any]) -> dict[str, Any]:
    """
    Convert a dictionary to a JSON-safe format.

    Args:
        data: Dictionary to convert

    Returns:
        JSON-safe dictionary
    """
    return json.loads(to_json(data))
