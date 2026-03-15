from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine, inspect, text
from openforge.common.config import get_settings
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


def _required_alembic_version_length(script_dir) -> int:
    """Return the minimum length needed to store any revision id in history."""
    required_length = 32
    for revision in script_dir.walk_revisions():
        if revision.revision:
            required_length = max(required_length, len(revision.revision))
    return required_length


def _ensure_alembic_version_table_capacity(sync_engine, *, required_length: int) -> None:
    """Create or widen alembic_version.version_num before running migrations."""
    required_length = max(32, int(required_length))

    with sync_engine.begin() as conn:
        inspector = inspect(conn)
        table_names = set(inspector.get_table_names())
        if "alembic_version" not in table_names:
            conn.execute(
                text(
                    f"CREATE TABLE IF NOT EXISTS alembic_version "
                    f"(version_num VARCHAR({required_length}) NOT NULL)"
                )
            )
            return

        columns = {column["name"]: column for column in inspector.get_columns("alembic_version")}
        version_column = columns.get("version_num")
        if version_column is None:
            raise RuntimeError("alembic_version table exists but version_num column is missing")

        current_length = getattr(version_column.get("type"), "length", None)
        if current_length is None or current_length >= required_length:
            return

        if sync_engine.dialect.name == "sqlite":
            # SQLite does not enforce VARCHAR length limits.
            return

        conn.execute(
            text(
                f"ALTER TABLE alembic_version "
                f"ALTER COLUMN version_num TYPE VARCHAR({required_length})"
            )
        )


async def run_migrations():
    """Run Alembic migrations programmatically on startup."""
    import os
    from alembic.config import Config
    from alembic import command
    from alembic.script import ScriptDirectory
    from alembic.util.exc import CommandError

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
    # Tell env.py to skip fileConfig (avoid reconfiguring logging inside uvicorn)
    alembic_cfg.attributes["skip_logging_config"] = True

    # Ensure script_location is absolute (alembic.ini has a relative path, but
    # the container CWD is /app while migrations live in /app/backend/openforge/db/migrations)
    migrations_dir = os.path.join(backend_dir, "openforge", "db", "migrations")
    alembic_cfg.set_main_option("script_location", migrations_dir)

    # Override the database URL with the sync (psycopg2) version for Alembic
    settings = get_settings()
    sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)
    script_dir = ScriptDirectory.from_config(alembic_cfg)
    required_version_length = _required_alembic_version_length(script_dir)
    head_revision = script_dir.get_current_head()
    sync_engine = create_engine(sync_url)

    # Run alembic synchronously — it's a short-lived operation and using
    # run_in_executor can deadlock under uvicorn's event loop during startup.
    def _upgrade():
        command.upgrade(alembic_cfg, "head")

    try:
        _ensure_alembic_version_table_capacity(sync_engine, required_length=required_version_length)
        _upgrade()
    except CommandError as exc:
        # Recovery path for local dev volumes with a stale/removed revision id.
        # This can happen after migration squashing/history rewrites.
        if "Can't locate revision identified by" in str(exc):
            _ensure_alembic_version_table_capacity(sync_engine, required_length=required_version_length)
            with sync_engine.begin() as conn:
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

            logger.warning(
                "Alembic revision in database is not present in code; "
                "normalizing alembic_version to current head and retrying upgrade."
            )
            _upgrade()
        else:
            raise
    finally:
        sync_engine.dispose()
