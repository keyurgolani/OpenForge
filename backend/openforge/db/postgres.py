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

    # __file__ = .../backend/openforge/db/postgres.py
    # We need to walk up THREE levels to reach .../backend/
    this_file   = os.path.abspath(__file__)           # .../openforge/db/postgres.py
    db_dir      = os.path.dirname(this_file)           # .../openforge/db
    openforge_dir = os.path.dirname(db_dir)            # .../openforge
    backend_dir = os.path.dirname(openforge_dir)       # .../backend  ← alembic.ini lives here

    alembic_ini = os.path.join(backend_dir, "alembic.ini")

    if not os.path.exists(alembic_ini):
        raise FileNotFoundError(
            f"alembic.ini not found at {alembic_ini}. "
            f"backend_dir resolved to: {backend_dir}"
        )

    alembic_cfg = Config(alembic_ini)

    # Ensure script_location is absolute (alembic.ini has a relative path, but
    # the container CWD is /app while migrations live in /app/backend/openforge/db/migrations)
    migrations_dir = os.path.join(backend_dir, "openforge", "db", "migrations")
    alembic_cfg.set_main_option("script_location", migrations_dir)

    # Override the database URL with the sync (psycopg2) version for Alembic
    settings = get_settings()
    sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)

    # Run in a thread since alembic is synchronous
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: command.upgrade(alembic_cfg, "head"))
