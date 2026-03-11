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

    # CLIP visual embedding
    clip_model: str = "clip-ViT-B-32"
    clip_dimension: int = 512
    qdrant_visual_collection: str = "openforge_visual"

    # Encryption key for API keys (generated on first run if not set)
    encryption_key: str = ""

    # Admin password authentication (disabled if empty)
    admin_password: str = ""
    session_expiry_hours: int = 168  # 7 days

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Celery agent execution (set to true when celery-worker service is running)
    use_celery_agents: bool = False

    # Tool server
    tool_server_url: str = "http://tool-server:8001"

    # Self-referencing URL used when the tool server needs to call back into the main app
    main_app_url: str = "http://backend:3000"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
