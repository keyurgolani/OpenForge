"""
Configuration package for OpenForge.

This package centralizes all configuration loading and management.
Import settings from here for consistent configuration access.

Usage:
    from openforge.common.config import get_settings, Settings
    settings = get_settings()
"""

from openforge.common.config.settings import Settings, get_settings
from openforge.common.config.loaders import (
    coerce_bool_setting,
    find_env_file,
    get_env_var,
    get_project_root,
    parse_bool,
    parse_int,
    parse_list,
)
from openforge.common.config.types import (
    AuthConfig,
    ClipConfig,
    DatabaseConfig,
    EmbeddingConfig,
    ExternalServicesConfig,
    LogLevel,
    QdrantConfig,
    RedisConfig,
    ServerConfig,
    StorageConfig,
)

__all__ = [
    # Settings
    "Settings",
    "get_settings",
    # Loaders
    "coerce_bool_setting",
    "find_env_file",
    "get_env_var",
    "get_project_root",
    "parse_bool",
    "parse_int",
    "parse_list",
    # Types
    "AuthConfig",
    "ClipConfig",
    "DatabaseConfig",
    "EmbeddingConfig",
    "ExternalServicesConfig",
    "LogLevel",
    "QdrantConfig",
    "RedisConfig",
    "ServerConfig",
    "StorageConfig",
]
