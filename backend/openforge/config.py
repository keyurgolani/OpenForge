from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://openforge:changeme@localhost:5432/openforge"

    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "openforge_knowledge"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Tool Server
    tool_server_url: str = "http://tool-server:3001"

    # Workspace
    workspace_root: str = "/workspace"
    uploads_root: str = "/uploads"

    # Server
    port: int = 3000
    log_level: str = "info"
    cors_origins: str = "*"

    # Embedding
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimension: int = 384

    # Encryption key for API keys (generated on first run if not set)
    encryption_key: str = ""

@lru_cache()
def get_settings() -> Settings:
    return Settings()
