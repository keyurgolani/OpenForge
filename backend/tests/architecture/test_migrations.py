from __future__ import annotations

import re
from pathlib import Path

from openforge.db.models import Base


VERSIONS_DIR = Path(__file__).resolve().parents[2] / "openforge" / "db" / "migrations" / "versions"
EXPECTED_MIGRATIONS = [
    "001_initial_schema.py",
    "002_wave3_drop_deprecated_tables.py",
    "003_add_deployments_table.py",
    "004_automation_graph_tables.py",
    "005_global_agent_chat.py",
    "006_nullable_execution_workspace.py",
    "007_agent_definition_restructure.py",
    "008_drop_retrieval_config.py",
    "009_add_intelligence_categories.py",
]


def test_migration_chain_matches_current_release_history() -> None:
    numbered_files = sorted(
        path.name
        for path in VERSIONS_DIR.glob("[0-9][0-9][0-9]_*.py")
    )
    assert numbered_files == EXPECTED_MIGRATIONS


def test_migrations_cover_current_sqlalchemy_tables() -> None:
    migration_text = "\n".join(
        (VERSIONS_DIR / filename).read_text()
        for filename in EXPECTED_MIGRATIONS
    )
    created_tables = set(re.findall(r"op\.create_table\(\s*['\"]([^'\"]+)['\"]", migration_text))
    expected_tables = set(Base.metadata.tables.keys())

    assert expected_tables.issubset(created_tables)
