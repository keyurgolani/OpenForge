from __future__ import annotations

import re
from pathlib import Path

from openforge.db.models import Base


VERSIONS_DIR = Path(__file__).resolve().parents[1] / "openforge" / "db" / "migrations" / "versions"
INITIAL_MIGRATION = VERSIONS_DIR / "001_initial_schema.py"


def test_phase0_collapses_migrations_to_single_initial_file() -> None:
    numbered_files = sorted(
        path.name
        for path in VERSIONS_DIR.glob("[0-9][0-9][0-9]_*.py")
    )
    assert numbered_files == ["001_initial_schema.py"]


def test_initial_migration_covers_current_sqlalchemy_tables() -> None:
    text = INITIAL_MIGRATION.read_text()
    created_tables = set(re.findall(r"op\.create_table\(\s*['\"]([^'\"]+)['\"]", text))
    expected_tables = set(Base.metadata.tables.keys())

    assert expected_tables.issubset(created_tables)
