"""Async Neo4j driver singleton and POLE+O schema initialization."""

from __future__ import annotations

import logging

from neo4j import AsyncGraphDatabase, AsyncDriver

from openforge.common.config import get_settings

logger = logging.getLogger("openforge.neo4j")

_driver: AsyncDriver | None = None


def get_neo4j_driver() -> AsyncDriver:
    """Return an async Neo4j driver.

    Each call creates a fresh driver instance.  The async driver binds
    internal futures to the running event loop, so a singleton shared
    across Celery tasks (each of which spins up its own loop via
    ``_run_async``) causes "Future attached to a different loop" errors.
    Creating a new driver per call is cheap (no network I/O until a
    session is opened) and avoids this class of bugs entirely.
    """
    settings = get_settings()
    return AsyncGraphDatabase.driver(
        settings.neo4j_url,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )


async def close_neo4j_driver() -> None:
    """Close the Neo4j driver and reset the singleton."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
        logger.info("Neo4j driver closed.")


async def init_neo4j_schema() -> None:
    """Create POLE+O constraints and indexes (idempotent).

    Skips entirely when ``settings.memory_enabled`` is False.
    """
    settings = get_settings()
    if not settings.memory_enabled:
        logger.info("Memory disabled — skipping Neo4j schema initialization.")
        return

    driver = get_neo4j_driver()

    constraints = [
        "CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (n:Memory) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT fact_id_unique IF NOT EXISTS FOR (n:Fact) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT workspace_id_unique IF NOT EXISTS FOR (n:Workspace) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (n:Agent) REQUIRE n.id IS UNIQUE",
    ]

    indexes = [
        "CREATE INDEX entity_name_idx IF NOT EXISTS FOR (n:Entity) ON (n.name)",
        "CREATE INDEX entity_type_idx IF NOT EXISTS FOR (n:Entity) ON (n.type)",
        "CREATE INDEX memory_type_idx IF NOT EXISTS FOR (n:Memory) ON (n.memory_type)",
        "CREATE INDEX fact_subject_idx IF NOT EXISTS FOR (n:Fact) ON (n.subject)",
        "CREATE INDEX fact_valid_from_idx IF NOT EXISTS FOR (n:Fact) ON (n.valid_from)",
    ]

    async with driver.session() as session:
        for stmt in constraints + indexes:
            await session.run(stmt)

    logger.info(
        "Neo4j POLE+O schema initialized (%d constraints, %d indexes).",
        len(constraints),
        len(indexes),
    )
