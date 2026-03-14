"""
Configuration loaders and utilities.

This module provides utilities for loading and validating configuration
from various sources (environment variables, files, etc.).
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger("openforge.config")


def parse_bool(value: str | bool | None, default: bool = False) -> bool:
    """Parse a boolean value from various input types."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("true", "1", "yes", "on")


def parse_int(value: str | int | None, default: int = 0) -> int:
    """Parse an integer value from various input types."""
    if value is None:
        return default
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def parse_list(value: str | list | None, separator: str = ",", default: list | None = None) -> list:
    """Parse a list from a comma-separated string or return the list directly."""
    if value is None:
        return default or []
    if isinstance(value, list):
        return value
    return [item.strip() for item in str(value).split(separator) if item.strip()]


def get_env_var(key: str, default: Any = None, required: bool = False) -> str | None:
    """
    Get an environment variable with optional default and validation.

    Args:
        key: Environment variable name
        default: Default value if not set
        required: If True, raises an error when not set

    Returns:
        The environment variable value or default

    Raises:
        ValueError: If required is True and variable is not set
    """
    value = os.environ.get(key, default)
    if required and value is None:
        raise ValueError(f"Required environment variable '{key}' is not set")
    return value


def find_env_file(start_path: Path | None = None, max_parents: int = 5) -> Path | None:
    """
    Find the .env file by searching upward from the start path.

    Args:
        start_path: Directory to start searching from
        max_parents: Maximum number of parent directories to search

    Returns:
        Path to .env file or None if not found
    """
    if start_path is None:
        start_path = Path.cwd()

    current = start_path.resolve()
    for _ in range(max_parents):
        env_path = current / ".env"
        if env_path.exists():
            return env_path
        parent = current.parent
        if parent == current:
            break
        current = parent

    return None


@lru_cache()
def get_project_root() -> Path:
    """Get the project root directory."""
    # Start from this file's location and go up until we find a marker
    current = Path(__file__).resolve()
    for _ in range(10):
        if (current / "pyproject.toml").exists() or (current / "setup.py").exists():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    return Path.cwd()


def coerce_bool_setting(raw: Any, default: bool = True) -> bool:
    """
    Coerce a raw setting value to boolean.

    Handles various representations: bool, str ("true"/"false"/"1"/"0"),
    int (1/0), and None.

    Args:
        raw: Raw setting value
        default: Default value if raw is None or unparseable

    Returns:
        Boolean value
    """
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.lower() in ("true", "1", "yes", "on", "enabled")
    if isinstance(raw, int):
        return bool(raw)
    return default
