from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openforge.db.models import Config
from openforge.schemas.settings import ConfigItem, ConfigUpdate
from openforge.common.crypto import decrypt_value, encrypt_value
from typing import Any, Optional
from datetime import datetime, timezone
import logging

logger = logging.getLogger("openforge.config")

# Track startup time to detect changed configs
_startup_time = datetime.now(timezone.utc)


class ConfigService:
    async def get_all_config(self, db: AsyncSession) -> list[ConfigItem]:
        result = await db.execute(select(Config))
        rows = result.scalars().all()
        items = []
        for row in rows:
            value = "***masked***" if row.sensitive else row.value
            items.append(ConfigItem(key=row.key, value=value, category=row.category))
        return items

    async def get_config(self, db: AsyncSession, key: str) -> Optional[ConfigItem]:
        result = await db.execute(select(Config).where(Config.key == key))
        row = result.scalar_one_or_none()
        if not row:
            return None
        value = "***masked***" if row.sensitive else row.value
        return ConfigItem(key=row.key, value=value, category=row.category)

    async def get_config_raw(self, db: AsyncSession, key: str) -> Any:
        """Internal: returns the actual value, decrypting if sensitive."""
        result = await db.execute(select(Config).where(Config.key == key))
        row = result.scalar_one_or_none()
        if not row:
            return None
        if row.sensitive and isinstance(row.value, str):
            try:
                return decrypt_value(row.value.encode())
            except Exception:
                return row.value
        return row.value

    async def set_config(
        self,
        db: AsyncSession,
        key: str,
        value: Any,
        category: str = "general",
        sensitive: bool = False,
    ) -> ConfigItem:
        stored_value = value
        if sensitive and isinstance(value, str):
            stored_value = encrypt_value(value).decode()

        result = await db.execute(select(Config).where(Config.key == key))
        row = result.scalar_one_or_none()

        if row:
            row.value = stored_value
            row.category = category
            row.sensitive = sensitive
            row.updated_at = datetime.now(timezone.utc)
        else:
            row = Config(
                key=key,
                value=stored_value,
                category=category,
                sensitive=sensitive,
            )
            db.add(row)

        await db.commit()
        await db.refresh(row)
        return ConfigItem(key=row.key, value="***masked***" if sensitive else value, category=row.category)

    async def check_needs_restart(self, db: AsyncSession) -> bool:
        result = await db.execute(
            select(Config).where(
                Config.category == "restart_required",
                Config.updated_at > _startup_time,
            )
        )
        return bool(result.scalars().first())


config_service = ConfigService()
