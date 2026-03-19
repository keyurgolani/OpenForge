"""Configuration flags for automation features."""

from __future__ import annotations

from typing import Any


AUTO_KNOWLEDGE_INTELLIGENCE_KEY = "auto_knowledge_intelligence"
AUTO_BOOKMARK_CONTENT_EXTRACTION_KEY = "auto_bookmark_content_extraction"


def coerce_bool_setting(value: Any, default: bool = True) -> bool:
    """Coerce a flexible setting value to bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.lower() in ("true", "1", "yes", "on")
    return default


async def is_auto_knowledge_intelligence_enabled(db: Any) -> bool:
    from openforge.services.config_service import config_service
    raw = await config_service.get_config_raw(db, AUTO_KNOWLEDGE_INTELLIGENCE_KEY)
    if raw is None:
        return True
    return coerce_bool_setting(raw, True)


async def is_auto_bookmark_content_extraction_enabled(db: Any) -> bool:
    from openforge.services.config_service import config_service
    raw = await config_service.get_config_raw(db, AUTO_BOOKMARK_CONTENT_EXTRACTION_KEY)
    if raw is None:
        return True
    return coerce_bool_setting(raw, True)
