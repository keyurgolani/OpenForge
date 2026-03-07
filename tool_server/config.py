"""
Tool Server configuration.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class ToolServerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server ports
    rest_port: int = 3001
    mcp_port: int = 3002

    # Workspace root (where all workspace directories are mounted)
    workspace_root: str = "/workspace"

    # Main app URL (for tools that need to call back)
    main_app_url: str = "http://localhost:3000"

    # Redis URL (for agent memory tools)
    redis_url: str = "redis://localhost:6379/0"

    # Search engine URL (SearxNG or compatible API)
    search_url: str = ""  # e.g., "http://searxng:8080/search"

    # Logging
    log_level: str = "info"


@lru_cache()
def get_settings() -> ToolServerSettings:
    return ToolServerSettings()
