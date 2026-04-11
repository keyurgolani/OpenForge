"""Core memory service — handles store, recall, forget operations."""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, update, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import MemoryModel, MemoryWALModel
from openforge.core.embedding import embed_text
from openforge.db.qdrant_client import get_qdrant
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

logger = logging.getLogger("openforge.memory")


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class MemoryService:
    """Handles memory CRUD, vector upsert, and WAL logging."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def store(
        self,
        content: str,
        source_type: str,
        memory_type: str = "context",
        confidence: float = 0.8,
        tags: list[str] | None = None,
        workspace_id: UUID | None = None,
        knowledge_id: UUID | None = None,
        source_agent_id: UUID | None = None,
        source_run_id: UUID | None = None,
        source_conversation_id: UUID | None = None,
        parent_memory_id: UUID | None = None,
    ) -> MemoryModel:
        """Store a memory: PG insert + Qdrant upsert (sync). Neo4j enrichment is async."""
        content_hash = _content_hash(content)

        # Check for exact duplicate
        existing = await self.db.scalar(
            select(MemoryModel).where(
                MemoryModel.content_hash == content_hash,
                MemoryModel.invalidated_at.is_(None),
            )
        )
        if existing:
            logger.debug("Duplicate memory skipped: hash=%s", content_hash[:16])
            return existing

        memory = MemoryModel(
            id=uuid4(),
            content=content,
            memory_type=memory_type,
            tier="short_term",
            confidence=confidence,
            observed_at=datetime.now(timezone.utc),
            source_type=source_type,
            source_agent_id=source_agent_id,
            source_run_id=source_run_id,
            source_conversation_id=source_conversation_id,
            workspace_id=workspace_id,
            knowledge_id=knowledge_id,
            parent_memory_id=parent_memory_id,
            tags=tags or [],
            content_hash=content_hash,
        )
        self.db.add(memory)
        await self.db.flush()
        await self.db.refresh(memory)

        # Qdrant upsert
        try:
            vector = embed_text(content)
            qdrant = get_qdrant()
            qdrant.upsert(
                collection_name="openforge_memory",
                points=[
                    PointStruct(
                        id=str(memory.id),
                        vector=vector,
                        payload={
                            "memory_id": str(memory.id),
                            "memory_type": memory_type,
                            "tier": "short_term",
                            "confidence": confidence,
                            "workspace_id": str(workspace_id) if workspace_id else None,
                            "agent_id": str(source_agent_id) if source_agent_id else None,
                            "tags": tags or [],
                            "observed_at": memory.observed_at.isoformat(),
                            "invalidated": False,
                        },
                    )
                ],
            )
        except Exception as e:
            logger.error("Qdrant upsert failed for memory %s: %s", memory.id, e)

        # Log to WAL
        await self._wal_log("create", "agent" if source_type == "agent" else source_type, memory.id, after_content=content)

        # Trigger async Neo4j enrichment
        try:
            from openforge.memory.tasks import enrich_memory_task
            enrich_memory_task.delay(str(memory.id))
        except Exception as e:
            logger.warning("Failed to queue enrichment for memory %s: %s", memory.id, e)

        await self.db.commit()
        return memory

    async def recall_fulltext(
        self,
        query: str,
        workspace_id: UUID | None = None,
        memory_type: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """PostgreSQL full-text search on memory content."""
        conditions = [
            MemoryModel.invalidated_at.is_(None),
        ]
        if workspace_id:
            conditions.append(MemoryModel.workspace_id == workspace_id)
        if memory_type:
            conditions.append(MemoryModel.memory_type == memory_type)

        stmt = (
            select(
                MemoryModel,
                func.ts_rank(
                    func.to_tsvector("english", MemoryModel.content),
                    func.plainto_tsquery("english", query),
                ).label("rank"),
            )
            .where(*conditions)
            .where(
                func.to_tsvector("english", MemoryModel.content).match(query)
            )
            .order_by(text("rank DESC"))
            .limit(limit)
        )

        result = await self.db.execute(stmt)
        rows = result.all()
        return [
            {
                "id": str(row.MemoryModel.id),
                "content": row.MemoryModel.content,
                "memory_type": row.MemoryModel.memory_type,
                "tier": row.MemoryModel.tier,
                "confidence": row.MemoryModel.confidence,
                "score": float(row.rank),
                "observed_at": row.MemoryModel.observed_at.isoformat(),
                "workspace_id": str(row.MemoryModel.workspace_id) if row.MemoryModel.workspace_id else None,
                "tags": row.MemoryModel.tags,
                "source": "fulltext",
            }
            for row in rows
        ]

    async def forget(self, memory_id: UUID, daemon: str = "user") -> bool:
        """Soft-delete a memory by setting invalidated_at."""
        memory = await self.db.get(MemoryModel, memory_id)
        if not memory or memory.invalidated_at is not None:
            return False

        before = memory.content
        memory.invalidated_at = datetime.now(timezone.utc)
        memory.updated_at = datetime.now(timezone.utc)

        # Mark as invalidated in Qdrant
        try:
            qdrant = get_qdrant()
            qdrant.set_payload(
                collection_name="openforge_memory",
                payload={"invalidated": True},
                points=[str(memory_id)],
            )
        except Exception as e:
            logger.error("Qdrant invalidation failed for memory %s: %s", memory_id, e)

        await self._wal_log("invalidate", daemon, memory_id, before_content=before)
        await self.db.commit()
        return True

    async def increment_recall(self, memory_ids: list[UUID]) -> None:
        """Bump recall_count and last_recalled_at for retrieved memories."""
        if not memory_ids:
            return
        await self.db.execute(
            update(MemoryModel)
            .where(MemoryModel.id.in_(memory_ids))
            .values(
                recall_count=MemoryModel.recall_count + 1,
                last_recalled_at=datetime.now(timezone.utc),
            )
        )
        await self.db.commit()

    async def get_l1_manifest(self, limit: int = 10) -> list[dict]:
        """Get the top memories by recall count for the L1 essential context."""
        stmt = (
            select(MemoryModel)
            .where(
                MemoryModel.invalidated_at.is_(None),
                MemoryModel.memory_type.notin_(["context", "experience"]),
            )
            .order_by(MemoryModel.recall_count.desc(), MemoryModel.observed_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        memories = result.scalars().all()
        return [
            {
                "id": str(m.id),
                "content": m.content[:200],
                "memory_type": m.memory_type,
                "workspace_id": str(m.workspace_id) if m.workspace_id else None,
                "tags": m.tags,
            }
            for m in memories
        ]

    async def _wal_log(
        self,
        operation: str,
        daemon: str,
        memory_id: UUID,
        before_content: str | None = None,
        after_content: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        wal = MemoryWALModel(
            operation=operation,
            daemon=daemon,
            memory_id=memory_id,
            before_content=before_content,
            after_content=after_content,
            metadata_json=metadata,
        )
        self.db.add(wal)
