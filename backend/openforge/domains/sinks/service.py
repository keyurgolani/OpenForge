"""Sink service — CRUD for first-class sink definitions."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import SinkModel

logger = logging.getLogger(__name__)


def _slugify(name: str) -> str:
    """Generate a URL-friendly slug from a name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:100]


class SinkService:
    """CRUD operations for Sink entities."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_sink(self, data: dict[str, Any]) -> SinkModel:
        """Create a new sink definition."""
        # Auto-generate slug if not provided or empty
        if not data.get("slug"):
            data["slug"] = _slugify(data["name"])

        # Map tags to tags_json for the ORM column
        tags = data.pop("tags", [])

        sink = SinkModel(
            name=data["name"],
            slug=data["slug"],
            description=data.get("description"),
            sink_type=data["sink_type"],
            config=data.get("config", {}),
            icon=data.get("icon"),
            tags_json=tags,
        )
        self._session.add(sink)
        await self._session.flush()
        await self._session.commit()
        await self._session.refresh(sink)
        logger.info("Created sink %s (%s) of type %s", sink.name, sink.id, sink.sink_type)
        return sink

    async def get_sink(self, sink_id: UUID) -> Optional[SinkModel]:
        """Get a single sink by ID."""
        result = await self._session.execute(
            select(SinkModel).where(SinkModel.id == sink_id)
        )
        return result.scalar_one_or_none()

    async def get_sink_by_slug(self, slug: str) -> Optional[SinkModel]:
        """Get a single sink by slug."""
        result = await self._session.execute(
            select(SinkModel).where(SinkModel.slug == slug)
        )
        return result.scalar_one_or_none()

    async def list_sinks(
        self,
        *,
        sink_type: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[SinkModel], int]:
        """List sinks with optional filters."""
        query = select(SinkModel)
        count_query = select(func.count()).select_from(SinkModel)

        if sink_type:
            query = query.where(SinkModel.sink_type == sink_type)
            count_query = count_query.where(SinkModel.sink_type == sink_type)

        if q:
            pattern = f"%{q}%"
            query = query.where(
                SinkModel.name.ilike(pattern) | SinkModel.description.ilike(pattern)
            )
            count_query = count_query.where(
                SinkModel.name.ilike(pattern) | SinkModel.description.ilike(pattern)
            )

        total_result = await self._session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(SinkModel.created_at.desc()).limit(limit).offset(offset)
        result = await self._session.execute(query)
        sinks = list(result.scalars().all())

        return sinks, total

    async def update_sink(self, sink_id: UUID, data: dict[str, Any]) -> Optional[SinkModel]:
        """Update a sink definition."""
        sink = await self.get_sink(sink_id)
        if sink is None:
            return None

        # Map tags to tags_json
        if "tags" in data:
            data["tags_json"] = data.pop("tags")

        for key, value in data.items():
            if value is not None and hasattr(sink, key):
                setattr(sink, key, value)

        await self._session.flush()
        await self._session.commit()
        await self._session.refresh(sink)
        logger.info("Updated sink %s (%s)", sink.name, sink.id)
        return sink

    async def delete_sink(self, sink_id: UUID) -> bool:
        """Delete a sink definition."""
        result = await self._session.execute(
            delete(SinkModel).where(SinkModel.id == sink_id)
        )
        await self._session.commit()
        deleted = result.rowcount > 0
        if deleted:
            logger.info("Deleted sink %s", sink_id)
        return deleted
