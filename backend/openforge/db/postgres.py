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
    from alembic.script import ScriptDirectory
    from alembic.util.exc import CommandError
    from sqlalchemy import create_engine, text

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

    # Run in a thread since Alembic is synchronous.
    loop = asyncio.get_event_loop()

    def _upgrade():
        command.upgrade(alembic_cfg, "head")

    try:
        await loop.run_in_executor(None, _upgrade)
    except CommandError as exc:
        # Recovery path for local dev volumes with a stale/removed revision id.
        # This can happen after migration squashing/history rewrites.
        if "Can't locate revision identified by" in str(exc):
            script_dir = ScriptDirectory.from_config(alembic_cfg)
            head_revision = script_dir.get_current_head()

            def _normalize_alembic_version():
                sync_engine = create_engine(sync_url)
                try:
                    with sync_engine.begin() as conn:
                        conn.execute(
                            text(
                                "CREATE TABLE IF NOT EXISTS alembic_version "
                                "(version_num VARCHAR(32) NOT NULL)"
                            )
                        )
                        count = conn.execute(
                            text("SELECT COUNT(*) FROM alembic_version")
                        ).scalar_one()
                        if count == 0:
                            conn.execute(
                                text("INSERT INTO alembic_version (version_num) VALUES (:rev)"),
                                {"rev": head_revision},
                            )
                        else:
                            conn.execute(
                                text("UPDATE alembic_version SET version_num = :rev"),
                                {"rev": head_revision},
                            )
                finally:
                    sync_engine.dispose()

            logger.warning(
                "Alembic revision in database is not present in code; "
                "normalizing alembic_version to current head and retrying upgrade."
            )
            await loop.run_in_executor(None, _normalize_alembic_version)
            await loop.run_in_executor(None, _upgrade)
        else:
            raise
