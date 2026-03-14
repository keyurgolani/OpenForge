"""
Common time utilities for OpenForge.

This module provides centralized time handling utilities
for consistent timestamp management across the application.
"""

from datetime import datetime, timezone
from typing import Optional


def utc_now() -> datetime:
    """
    Get current UTC time.

    Returns:
        Current UTC datetime
    """
    return datetime.now(timezone.utc)


def to_isoformat(dt: datetime) -> str:
    """
    Convert datetime to ISO format string.

    Args:
        dt: Datetime to convert

    Returns:
        ISO format string
    """
    return dt.isoformat()


def from_isoformat(iso_str: str) -> Optional[datetime]:
    """
    Parse ISO format string to datetime.

    Args:
        iso_str: ISO format string

    Returns:
        Datetime object or None if invalid
    """
    try:
        return datetime.fromisoformat(iso_str)
    except (ValueError, AttributeError):
        return None


def format_timestamp(dt: datetime, fmt: str = "%Y%m%d-%H%M%S") -> str:
    """
    Format datetime to string.

    Args:
        dt: Datetime to format
        fmt: Format string (default: %Y%m%d-%H%M%S)

    Returns:
        Formatted string
    """
    return dt.strftime(fmt)


def timestamp_filename(prefix: str = "", suffix: str = "") -> str:
    """
    Generate a filename with timestamp.

    Args:
        prefix: Filename prefix
        suffix: Filename suffix (including extension)

    Returns:
        Filename with timestamp
    """
    timestamp = format_timestamp(utc_now())
    parts = [p for p in [prefix, timestamp, suffix] if p]
    return "-".join(parts)
