"""
Configuration type definitions.

This module contains typed configuration classes and enums
for the OpenForge application settings.
"""

from __future__ import annotations

from enum import Enum
from typing import TypedDict


class LogLevel(str, Enum):
    """Supported logging levels."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class DatabaseConfig(TypedDict):
    """Database connection configuration."""
    url: str
    pool_size: int
    max_overflow: int


class QdrantConfig(TypedDict):
    """Qdrant vector database configuration."""
    url: str
    collection: str
    visual_collection: str


class RedisConfig(TypedDict):
    """Redis connection configuration."""
    url: str


class EmbeddingConfig(TypedDict):
    """Text embedding model configuration."""
    model: str
    dimension: int


class ClipConfig(TypedDict):
    """CLIP visual embedding configuration."""
    model: str
    dimension: int


class ServerConfig(TypedDict):
    """Server configuration."""
    port: int
    log_level: str
    cors_origins: str


class StorageConfig(TypedDict):
    """File storage configuration."""
    workspace_root: str
    uploads_root: str
    models_root: str


class AuthConfig(TypedDict):
    """Authentication configuration."""
    admin_password: str
    session_expiry_hours: int


class ExternalServicesConfig(TypedDict):
    """External services configuration."""
    tool_server_url: str
    main_app_url: str
