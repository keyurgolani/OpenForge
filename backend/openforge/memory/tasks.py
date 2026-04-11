"""Celery tasks for async memory enrichment (entity extraction + Neo4j graph)
and periodic background daemons (consolidation, learning extraction, lint)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from openforge.worker.celery_app import celery_app

logger = logging.getLogger("openforge.memory.tasks")


def _run_async(coro):
    """Create a new event loop, run the coroutine, and close the loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="memory.store_async", bind=True, max_retries=1)
def store_memory_async_task(
    self,
    content,
    source_type,
    memory_type="context",
    confidence=0.8,
    tags=None,
    workspace_id=None,
    knowledge_id=None,
    source_agent_id=None,
    source_run_id=None,
    source_conversation_id=None,
):
    """Store a memory asynchronously via Celery (no DB session required by caller)."""
    _run_async(
        _store_memory_impl(
            content=content,
            source_type=source_type,
            memory_type=memory_type,
            confidence=confidence,
            tags=tags,
            workspace_id=workspace_id,
            knowledge_id=knowledge_id,
            source_agent_id=source_agent_id,
            source_run_id=source_run_id,
            source_conversation_id=source_conversation_id,
        )
    )


async def _store_memory_impl(**kwargs):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    from openforge.common.config import get_settings
    from openforge.domains.memory.service import MemoryService

    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            service = MemoryService(db)
            ws_id = kwargs.pop("workspace_id", None)
            if ws_id and isinstance(ws_id, str):
                from uuid import UUID as _UUID

                ws_id = _UUID(ws_id)
            kwargs["workspace_id"] = ws_id
            k_id = kwargs.pop("knowledge_id", None)
            if k_id and isinstance(k_id, str):
                from uuid import UUID as _UUID

                k_id = _UUID(k_id)
            kwargs["knowledge_id"] = k_id
            await service.store(**kwargs)
    finally:
        await engine.dispose()


@celery_app.task(name="memory.enrich", bind=True, max_retries=3, default_retry_delay=10)
def enrich_memory_task(self, memory_id: str):
    """Celery task that enriches a memory with entity extraction and Neo4j graph writes."""
    _run_async(_enrich_memory(UUID(memory_id)))


async def _enrich_memory(memory_id: UUID) -> None:
    """Core enrichment logic: load memory, extract entities, write to Neo4j."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    from openforge.common.config import get_settings
    from openforge.db.models import MemoryModel
    from openforge.memory.extraction import extract_entities_cascade
    from openforge.memory.resolution import resolve_entities
    from openforge.memory.graph_writer import (
        write_memory_node,
        write_entity,
        write_mentions,
        write_relations,
        write_workspace_provenance,
        write_agent_provenance,
    )

    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            memory = await db.get(MemoryModel, memory_id)
            if memory is None or memory.invalidated_at is not None:
                logger.debug("Skipping enrichment for memory %s (not found or invalidated)", memory_id)
                return

            # Write Memory node to Neo4j
            await write_memory_node(
                memory_id=str(memory.id),
                content=memory.content,
                memory_type=memory.memory_type,
                tier=memory.tier,
                observed_at=memory.observed_at.isoformat(),
            )

            # Extract entities via cascade pipeline
            extraction = await extract_entities_cascade(
                memory.content,
                use_llm_fallback=settings.memory_entity_extraction_llm_fallback,
            )

            if not extraction.entities:
                logger.debug("No entities extracted for memory %s", memory_id)
                return

            # Resolve entities against existing Neo4j graph
            resolved = await resolve_entities(extraction.entities)

            # Write entity nodes and build name-to-id mapping
            entity_name_to_id: dict[str, str] = {}
            entity_ids: list[str] = []
            confidences: list[float] = []

            for res in resolved:
                node_id = await write_entity(res)
                entity_name_to_id[res.entity.name] = node_id
                entity_ids.append(node_id)
                confidences.append(res.entity.confidence)

            # Write MENTIONS edges from memory to entities
            await write_mentions(str(memory.id), entity_ids, confidences)

            # Write RELATED_TO edges between entities
            if extraction.relations:
                await write_relations(extraction.relations, entity_name_to_id)

            # Write provenance edges
            if memory.workspace_id:
                await write_workspace_provenance(str(memory.id), str(memory.workspace_id))
            if memory.source_agent_id:
                await write_agent_provenance(str(memory.id), str(memory.source_agent_id))

            logger.info(
                "Enriched memory %s: %d entities, %d relations",
                memory_id,
                len(resolved),
                len(extraction.relations),
            )
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Task 20: Consolidation Daemon
# ---------------------------------------------------------------------------

@celery_app.task(name="memory.consolidate", bind=True, max_retries=0)
def consolidation_daemon_task(self):
    """Periodic consolidation: promote, garbage-collect, rebuild manifest."""
    _run_async(_run_consolidation())


async def _run_consolidation() -> None:
    from sqlalchemy import select, delete
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    from openforge.common.config import get_settings
    from openforge.db.models import MemoryModel, MemoryWALModel
    from openforge.memory.manifest import rebuild_l1_manifest

    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    now = datetime.now(timezone.utc)
    promoted = 0
    gc_invalidated = 0
    gc_expired = 0
    gc_wal = 0

    try:
        async with Session() as db:
            # Phase 1 — Fetch short_term memories older than 5 minutes
            cutoff = now - timedelta(minutes=5)
            stmt = (
                select(MemoryModel)
                .where(
                    MemoryModel.tier == "short_term",
                    MemoryModel.invalidated_at.is_(None),
                    MemoryModel.created_at < cutoff,
                )
                .order_by(MemoryModel.created_at)
            )
            result = await db.execute(stmt)
            memories = result.scalars().all()

            # Phase 2 — Promote eligible memories to long_term
            promotable_types = {"fact", "preference", "lesson", "decision"}
            for mem in memories:
                should_promote = (
                    mem.recall_count >= settings.memory_recall_promotion_threshold
                    or mem.memory_type in promotable_types
                )
                if should_promote:
                    mem.tier = "long_term"
                    mem.promoted_at = now
                    # Log WAL entry
                    wal_entry = MemoryWALModel(
                        operation="promote",
                        daemon="consolidation",
                        memory_id=mem.id,
                        before_content=None,
                        after_content=None,
                        metadata_json={"from_tier": "short_term", "to_tier": "long_term"},
                    )
                    db.add(wal_entry)
                    promoted += 1

            await db.flush()

            # Phase 3 — Garbage Collect
            # 3a: Hard-delete invalidated memories past retention
            inv_cutoff = now - timedelta(days=settings.memory_invalidated_retention_days)
            del_inv = delete(MemoryModel).where(
                MemoryModel.invalidated_at.is_not(None),
                MemoryModel.invalidated_at < inv_cutoff,
            )
            inv_result = await db.execute(del_inv)
            gc_invalidated = inv_result.rowcount

            # 3b: Hard-delete expired short_term memories
            st_cutoff = now - timedelta(days=settings.memory_short_term_retention_days)
            del_st = delete(MemoryModel).where(
                MemoryModel.tier == "short_term",
                MemoryModel.invalidated_at.is_(None),
                MemoryModel.created_at < st_cutoff,
            )
            st_result = await db.execute(del_st)
            gc_expired = st_result.rowcount

            # 3c: Delete WAL entries older than 180 days
            wal_cutoff = now - timedelta(days=180)
            del_wal = delete(MemoryWALModel).where(MemoryWALModel.created_at < wal_cutoff)
            wal_result = await db.execute(del_wal)
            gc_wal = wal_result.rowcount

            await db.commit()

            # Phase 4 — Rebuild L1 manifest
            await rebuild_l1_manifest(db)

        logger.info(
            "Consolidation complete: promoted=%d, gc_invalidated=%d, gc_expired=%d, gc_wal=%d",
            promoted, gc_invalidated, gc_expired, gc_wal,
        )
    except Exception:
        logger.exception("Consolidation daemon failed")
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Task 21: Learning Extraction Daemon
# ---------------------------------------------------------------------------

@celery_app.task(name="memory.learning_extraction", bind=True, max_retries=0)
def learning_extraction_task(self):
    """Periodic learning extraction from tool call logs."""
    _run_async(_run_learning_extraction())


async def _run_learning_extraction() -> None:
    from sqlalchemy import select, func, case
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    from openforge.common.config import get_settings
    from openforge.db.models import ToolCallLog
    from openforge.domains.memory.service import MemoryService

    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)
    stored = 0

    try:
        async with Session() as db:
            # Aggregate tool call stats for the last 24 hours
            stmt = (
                select(
                    ToolCallLog.tool_name,
                    func.count().label("total"),
                    func.sum(
                        case((ToolCallLog.success == False, 1), else_=0)  # noqa: E712
                    ).label("failures"),
                )
                .where(ToolCallLog.started_at >= since)
                .group_by(ToolCallLog.tool_name)
            )
            result = await db.execute(stmt)
            rows = result.all()

            if not rows:
                logger.info("Learning extraction: no tool call data in the last 24h")
                return

            svc = MemoryService(db)

            for row in rows:
                tool_name = row.tool_name
                total = row.total
                failures = row.failures or 0
                failure_rate = failures / total if total > 0 else 0.0

                # High failure rate pattern (>= 3 calls, > 50% failure)
                if total >= 3 and failure_rate > 0.5:
                    content = (
                        f"Tool '{tool_name}' had a high failure rate "
                        f"({failures}/{total} = {failure_rate:.0%}) over the last 24h. "
                        f"Investigate potential issues with this tool's configuration or inputs."
                    )
                    await svc.store(
                        content=content,
                        source_type="system",
                        memory_type="lesson",
                        confidence=0.7,
                        tags=["auto:learning-extraction", f"tool:{tool_name}", "pattern:high-failure"],
                    )
                    stored += 1

                # High reliability pattern (>= 5 calls, < 10% failure)
                elif total >= 5 and failure_rate < 0.1:
                    content = (
                        f"Tool '{tool_name}' is highly reliable "
                        f"({total - failures}/{total} successful = {1 - failure_rate:.0%} success rate) "
                        f"over the last 24h."
                    )
                    await svc.store(
                        content=content,
                        source_type="system",
                        memory_type="experience",
                        confidence=0.8,
                        tags=["auto:learning-extraction", f"tool:{tool_name}", "pattern:reliable"],
                    )
                    stored += 1

            await db.commit()

        logger.info("Learning extraction complete: %d memories stored", stored)
    except Exception:
        logger.exception("Learning extraction daemon failed")
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Task 22: Lint Daemon
# ---------------------------------------------------------------------------

@celery_app.task(name="memory.lint", bind=True, max_retries=0)
def lint_daemon_task(self):
    """Weekly lint: fix orphan memories, missing backlinks, rebuild manifest."""
    _run_async(_run_lint())


async def _run_lint() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    from openforge.common.config import get_settings
    from openforge.db.neo4j_client import get_neo4j_driver
    from openforge.memory.manifest import rebuild_l1_manifest

    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    orphans_requeued = 0
    backlinks_created = 0

    try:
        driver = get_neo4j_driver()

        # Check 1: Orphan memories — Memory nodes with no outgoing MENTIONS
        try:
            async with driver.session() as neo_session:
                result = await neo_session.run(
                    "MATCH (m:Memory) "
                    "WHERE NOT (m)-[:MENTIONS]->() "
                    "RETURN m.id AS memory_id "
                    "LIMIT 50"
                )
                records = await result.data()

            for record in records:
                mid = record["memory_id"]
                if mid:
                    enrich_memory_task.delay(mid)
                    orphans_requeued += 1

            logger.info("Lint: re-queued %d orphan memories for enrichment", orphans_requeued)
        except Exception:
            logger.exception("Lint: orphan memory check failed")

        # Check 2: Missing backlinks — unidirectional RELATES_TO edges
        try:
            async with driver.session() as neo_session:
                result = await neo_session.run(
                    "MATCH (a:Memory)-[:RELATES_TO]->(b:Memory) "
                    "WHERE NOT (b)-[:RELATES_TO]->(a) "
                    "RETURN a.id AS from_id, b.id AS to_id "
                    "LIMIT 100"
                )
                records = await result.data()

            if records:
                async with driver.session() as neo_session:
                    for record in records:
                        from_id = record["from_id"]
                        to_id = record["to_id"]
                        if from_id and to_id:
                            await neo_session.run(
                                "MATCH (a:Memory {id: $from_id}), (b:Memory {id: $to_id}) "
                                "MERGE (b)-[r:RELATES_TO]->(a) "
                                "ON CREATE SET r.type = 'backlink', r.confidence = 0.5",
                                from_id=from_id,
                                to_id=to_id,
                            )
                            backlinks_created += 1

            logger.info("Lint: created %d backlink relationships", backlinks_created)
        except Exception:
            logger.exception("Lint: backlink check failed")

        # Check 3: Manifest staleness — rebuild
        try:
            async with Session() as db:
                await rebuild_l1_manifest(db)
            logger.info("Lint: L1 manifest rebuilt")
        except Exception:
            logger.exception("Lint: manifest rebuild failed")

        logger.info(
            "Lint complete: orphans_requeued=%d, backlinks_created=%d",
            orphans_requeued, backlinks_created,
        )
    except Exception:
        logger.exception("Lint daemon failed")
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Task 23: Filesystem Mirror Daemon
# ---------------------------------------------------------------------------

@celery_app.task(name="memory.mirror_sync", bind=True, max_retries=0)
def mirror_sync_task(self):
    """Periodic mirror sync: render memories as Obsidian-compatible markdown."""
    _run_async(_mirror_sync())


async def _mirror_sync():
    from openforge.memory.mirror import sync_mirror
    await sync_mirror()
