"""Service for persistent agent memory with vector search and time-weighted recall."""

from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import AgentMemory

logger = logging.getLogger("openforge.agent_memory")

MEMORY_COLLECTION = "openforge_memory"


class AgentMemoryService:
    """Manages persistent agent memory entries backed by PostgreSQL and Qdrant."""

    async def store(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        agent_id: str | None,
        content: str,
        memory_type: str = "observation",
        confidence: float = 1.0,
    ) -> AgentMemory:
        """Store a new memory entry with vector embedding."""
        memory = AgentMemory(
            workspace_id=workspace_id,
            agent_id=agent_id,
            content=content,
            memory_type=memory_type,
            confidence=max(0.0, min(1.0, confidence)),
        )
        db.add(memory)
        await db.commit()
        await db.refresh(memory)

        # Embed and store in Qdrant
        try:
            from openforge.core.embedding import embed_text
            from openforge.db.qdrant_client import get_qdrant
            from qdrant_client.models import PointStruct

            vector = embed_text(content)
            point = PointStruct(
                id=str(memory.id),
                vector=vector,
                payload={
                    "memory_id": str(memory.id),
                    "workspace_id": str(workspace_id),
                    "agent_id": agent_id or "",
                    "memory_type": memory_type,
                    "content": content[:500],
                },
            )
            client = get_qdrant()
            client.upsert(collection_name=MEMORY_COLLECTION, points=[point])
        except Exception as e:
            logger.warning("Failed to embed memory %s in Qdrant: %s", memory.id, e)

        return memory

    async def recall(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        query: str,
        limit: int = 5,
        agent_id: str | None = None,
    ) -> list[dict]:
        """Recall memories via vector search with time-weighted scoring."""
        try:
            from openforge.core.embedding import embed_text
            from openforge.db.qdrant_client import get_qdrant
            from qdrant_client.models import Filter, FieldCondition, MatchValue

            vector = embed_text(query)
            client = get_qdrant()

            must_conditions = [
                FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id))),
            ]
            if agent_id:
                must_conditions.append(
                    FieldCondition(key="agent_id", match=MatchValue(value=agent_id)),
                )

            search_results = client.search(
                collection_name=MEMORY_COLLECTION,
                query_vector=vector,
                query_filter=Filter(must=must_conditions),
                limit=limit * 3,
                with_payload=True,
            )
        except Exception as e:
            logger.warning("Qdrant memory search failed: %s", e)
            return []

        if not search_results:
            return []

        # Fetch full memory records from DB for time-weighted scoring
        memory_ids = [UUID(hit.payload.get("memory_id", hit.id)) for hit in search_results]
        result = await db.execute(
            select(AgentMemory).where(
                AgentMemory.id.in_(memory_ids),
                AgentMemory.is_active == True,
            )
        )
        memories_by_id = {str(m.id): m for m in result.scalars().all()}

        now = datetime.now(timezone.utc)
        scored_results = []
        for hit in search_results:
            mid = hit.payload.get("memory_id", str(hit.id))
            mem = memories_by_id.get(mid)
            if not mem:
                continue

            age_hours = max(0.0, (now - mem.created_at).total_seconds() / 3600.0)
            time_weight = math.exp(-mem.decay_rate * age_hours) * mem.confidence
            final_score = hit.score * time_weight

            scored_results.append({
                "id": str(mem.id),
                "content": mem.content,
                "memory_type": mem.memory_type,
                "confidence": mem.confidence,
                "score": round(final_score, 4),
                "created_at": mem.created_at.isoformat(),
                "access_count": mem.access_count,
            })

        # Sort by final score and limit
        scored_results.sort(key=lambda x: x["score"], reverse=True)
        scored_results = scored_results[:limit]

        # Update access counts for returned memories
        if scored_results:
            recalled_ids = [UUID(r["id"]) for r in scored_results]
            await db.execute(
                update(AgentMemory)
                .where(AgentMemory.id.in_(recalled_ids))
                .values(
                    access_count=AgentMemory.access_count + 1,
                    last_accessed_at=now,
                )
            )
            await db.commit()

        return scored_results

    async def forget(self, db: AsyncSession, memory_id: UUID) -> bool:
        """Soft-delete a memory entry and remove from Qdrant."""
        result = await db.execute(
            select(AgentMemory).where(AgentMemory.id == memory_id)
        )
        memory = result.scalar_one_or_none()
        if not memory:
            return False

        memory.is_active = False
        await db.commit()

        # Remove from Qdrant
        try:
            from openforge.db.qdrant_client import get_qdrant
            client = get_qdrant()
            client.delete(
                collection_name=MEMORY_COLLECTION,
                points_selector=[str(memory_id)],
            )
        except Exception as e:
            logger.warning("Failed to delete memory %s from Qdrant: %s", memory_id, e)

        return True


agent_memory_service = AgentMemoryService()
