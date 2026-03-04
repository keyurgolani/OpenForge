from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from openforge.config import get_settings
import asyncio
import logging

logger = logging.getLogger("openforge.db")


def _make_engine():
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_size=10,
        max_overflow=20,
    )


engine = _make_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """Dependency injection for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def run_migrations():
    """Run Alembic migrations programmatically on startup."""
    import os
    from alembic.config import Config
    from alembic import command

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_ini = os.path.join(backend_dir, "alembic.ini")
    alembic_cfg = Config(alembic_ini)

    # Override the database URL with the async-compatible sync version
    settings = get_settings()
    sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)

    # Run in a thread since alembic is synchronous
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: command.upgrade(alembic_cfg, "head"))
