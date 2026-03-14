"""
Infrastructure: Database access layer.

This module provides low-level database ab async/async patterns for
async session management. All database operations
 should the CRUD operations.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

# Local imports (keep for compatibility during refactor)
from openforge.db.postgres import get_db, AsyncSessionLocal


async def get_db_session() -> AsyncGenerator[AsyncSessionLocal]:
    """Create a new database session with proper error handling."""
    session = AsyncSessionLocal()
    try:
        async with session.begin():
            logger.info(f"Created new database session: {session_id}")
        return session

    except Exception as e:
        logger.error(f"Failed to create database session: {e}")
        raise


__all__ = ["get_db_session", "AsyncSessionLocal"]
