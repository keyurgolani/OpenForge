"""Compatibility helpers for automation-related config flags."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

AUTO_KNOWLEDGE_INTELLIGENCE_KEY = "automation.auto_knowledge_intelligence_enabled"
AUTO_BOOKMARK_CONTENT_EXTRACTION_KEY = "automation.auto_bookmark_content_extraction_enabled"


def coerce_bool_setting(value: object, default: bool) -> bool:
    """Preserve the historical automation-config coercion semantics."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on", "enabled"}:
            return True
        if normalized in {"0", "false", "no", "off", "disabled"}:
            return False
    return default


async def is_auto_knowledge_intelligence_enabled(db: AsyncSession) -> bool:
    from openforge.services.config_service import config_service

    raw = await config_service.get_config_raw(db, AUTO_KNOWLEDGE_INTELLIGENCE_KEY)
    return coerce_bool_setting(raw, True)


async def is_auto_bookmark_content_extraction_enabled(db: AsyncSession) -> bool:
    from openforge.services.config_service import config_service

    raw = await config_service.get_config_raw(db, AUTO_BOOKMARK_CONTENT_EXTRACTION_KEY)
    return coerce_bool_setting(raw, True)


__all__ = [
    "AUTO_BOOKMARK_CONTENT_EXTRACTION_KEY",
    "AUTO_KNOWLEDGE_INTELLIGENCE_KEY",
    "coerce_bool_setting",
    "is_auto_bookmark_content_extraction_enabled",
    "is_auto_knowledge_intelligence_enabled",
]
