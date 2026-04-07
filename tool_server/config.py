from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class ToolServerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    rest_port: int = 8001
    workspace_root: str = "/workspace"
    main_app_url: str = "http://openforge:3000"
    redis_url: str = "redis://redis:6379/0"
    log_level: str = "warning"
    blocked_commands: str = "rm -rf /,dd if=,mkfs,shutdown,reboot,halt,poweroff"
    max_file_size_mb: int = 50
    shell_timeout_seconds: int = 30
    skills_dir: str = "/skills"
    skills_root: str = "/skills"
    searxng_url: str = "http://searxng:8080"
    pinchtab_url: str = "http://pinchtab:3000"
    crawl4ai_url: str = "http://crawl4ai:11235"


@lru_cache()
def get_settings() -> ToolServerSettings:
    return ToolServerSettings()
