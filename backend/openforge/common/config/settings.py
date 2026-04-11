from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Settings can be overridden via:
    1. Environment variables (highest priority)
    2. .env file in project root
    3. Default values (lowest priority)
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://openforge:changeme@localhost:5432/openforge"

    # ── Qdrant Vector Database ───────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "openforge_knowledge"

    # ── File Storage ─────────────────────────────────────────────────
    workspace_root: str = "/workspace"
    uploads_root: str = "/uploads"
    models_root: str = "/models"

    # ── Server ───────────────────────────────────────────────────────────
    port: int = 3000
    log_level: str = "info"
    cors_origins: str = "*"

    # ── Text Embedding ───────────────────────────────────────────────────
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimension: int = 384

    # ── CLIP Visual Embedding ──────────────────────────────────────────────────────
    clip_model: str = "clip-ViT-B-32"
    clip_dimension: int = 512

    # ── Security ─────────────────────────────────────────────────────────────
    # Encryption key for API keys (generated on first run if not set)
    encryption_key: str = ""
    # Admin password authentication (disabled if empty)
    admin_password: str = ""
    session_expiry_hours: int = 168  # 7 days

    # ── Redis ───────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379/0"

    # ── Search ─────────────────────────────────────────────────────────────
    # Reranking via cross-encoder (adds latency but improves relevance)
    search_reranking_enabled: bool = True

    # ── Celery Agent Execution ─────────────────────────────────────────────────────
    use_celery_agents: bool = True

    # ── Tool Server ─────────────────────────────────────────────────────────────
    tool_server_url: str = "http://tool-server:8001"
    # Self-referencing URL used when the tool server needs to call back
    main_app_url: str = "http://backend:3000"

    # ── Ollama ───────────────────────────────────────────────────────────────
    ollama_url: str = "http://ollama:11434"

    # ── Neo4j Graph Database ─────────────────────────────────────
    neo4j_url: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "openforge"
    memory_enabled: bool = True
    memory_consolidation_interval: int = 900
    memory_knowledge_sweep_interval: int = 7200
    memory_learning_schedule: str = "0 3 * * *"
    memory_lint_schedule: str = "0 2 * * 0"
    memory_mirror_enabled: bool = True
    memory_mirror_path: str = "/data/memory-vault"
    memory_mirror_sync_interval: int = 3600
    memory_short_term_retention_days: int = 30
    memory_invalidated_retention_days: int = 90
    memory_recall_promotion_threshold: int = 3
    memory_entity_extraction_llm_fallback: bool = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
