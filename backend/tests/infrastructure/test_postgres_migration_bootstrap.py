from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import String

import openforge.db.postgres as postgres_module


class _FakeResult:
    def __init__(self, value: int):
        self._value = value

    def scalar_one(self) -> int:
        return self._value


class _FakeInspector:
    def __init__(self, *, table_names: list[str], columns: list[dict]):
        self._table_names = list(table_names)
        self._columns = list(columns)

    def get_table_names(self) -> list[str]:
        return list(self._table_names)

    def get_columns(self, _table_name: str) -> list[dict]:
        return list(self._columns)


class _FakeConnection:
    def __init__(self):
        self.executed: list[tuple[str, dict | None]] = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.executed.append((sql, params))
        if "SELECT COUNT(*) FROM alembic_version" in sql:
            return _FakeResult(1)
        return None


class _FakeBeginContext:
    def __init__(self, connection: _FakeConnection):
        self._connection = connection

    def __enter__(self) -> _FakeConnection:
        return self._connection

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class _FakeEngine:
    def __init__(self, *, dialect_name: str = "postgresql"):
        self.connection = _FakeConnection()
        self.dialect = type("Dialect", (), {"name": dialect_name})()

    def begin(self) -> _FakeBeginContext:
        return _FakeBeginContext(self.connection)


def test_required_alembic_version_length_matches_current_revision_history() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "openforge" / "db" / "migrations"))
    script_dir = ScriptDirectory.from_config(alembic_cfg)

    required_length = postgres_module._required_alembic_version_length(script_dir)

    assert required_length >= len("012_phase13_observability_evaluation")


def test_ensure_alembic_version_table_capacity_widens_short_postgres_column(monkeypatch) -> None:
    engine = _FakeEngine()
    inspector = _FakeInspector(
        table_names=["alembic_version"],
        columns=[{"name": "version_num", "type": String(length=32)}],
    )

    monkeypatch.setattr(postgres_module, "inspect", lambda _conn: inspector)

    postgres_module._ensure_alembic_version_table_capacity(engine, required_length=64)

    assert (
        "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)",
        None,
    ) in engine.connection.executed
