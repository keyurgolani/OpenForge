"""
Shared CRUD helpers for core domain services.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect as sa_inspect


class CrudDomainService:
    """Minimal reusable CRUD implementation for domain services."""

    model = None
    field_aliases: dict[str, str] = {}

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _jsonb_safe(value: Any) -> Any:
        """Recursively convert UUID objects to strings for JSONB-safe storage."""
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, dict):
            return {k: CrudDomainService._jsonb_safe(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [CrudDomainService._jsonb_safe(item) for item in value]
        return value

    def _normalize_payload(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for key, value in payload.items():
            canon_key = self.field_aliases.get(key, key)
            col = getattr(self.model, canon_key, None) if self.model else None
            if col is not None and hasattr(col, 'type') and isinstance(getattr(col, 'type', None), JSONB):
                value = self._jsonb_safe(value)
            elif isinstance(value, (list, dict)):
                value = self._jsonb_safe(value)
            normalized[canon_key] = value
        return normalized

    def _serialize(self, instance: Any) -> dict[str, Any]:
        data = {
            attr.key: getattr(instance, attr.key)
            for attr in sa_inspect(instance).mapper.column_attrs
        }
        for public_name, internal_name in self.field_aliases.items():
            if internal_name in data:
                data[public_name] = data.pop(internal_name)
        return data

    def _list_query(self):
        order_column = getattr(self.model, "created_at", None) or getattr(self.model, "id")
        return select(self.model).order_by(order_column.desc() if hasattr(order_column, "desc") else order_column)

    def _apply_filters(self, query, filters: Mapping[str, Any] | None = None):
        if not filters:
            return query

        for key, value in filters.items():
            if value is None or not hasattr(self.model, key):
                continue
            query = query.where(getattr(self.model, key) == value)

        return query

    async def list_records(
        self,
        skip: int = 0,
        limit: int = 100,
        filters: Mapping[str, Any] | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        query = self._apply_filters(self._list_query(), filters)
        result = await self.db.execute(query.offset(skip).limit(limit))
        rows = result.scalars().all()
        total_query = self._apply_filters(select(func.count()).select_from(self.model), filters)
        total = await self.db.scalar(total_query)
        return [self._serialize(row) for row in rows], int(total or 0)

    async def get_record(self, record_id: UUID) -> dict[str, Any] | None:
        instance = await self.db.get(self.model, record_id)
        if instance is None:
            return None
        return self._serialize(instance)

    async def create_record(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        instance = self.model(**self._normalize_payload(payload))
        self.db.add(instance)
        await self.db.commit()
        await self.db.refresh(instance)
        return self._serialize(instance)

    async def update_record(self, record_id: UUID, payload: Mapping[str, Any]) -> dict[str, Any] | None:
        instance = await self.db.get(self.model, record_id)
        if instance is None:
            return None

        for key, value in self._normalize_payload(payload).items():
            setattr(instance, key, value)

        await self.db.commit()
        await self.db.refresh(instance)
        return self._serialize(instance)

    async def delete_record(self, record_id: UUID) -> bool:
        instance = await self.db.get(self.model, record_id)
        if instance is None:
            return False

        await self.db.delete(instance)
        await self.db.commit()
        return True
