from __future__ import annotations

import re
from pathlib import Path

from openforge.db.models import Base


VERSIONS_DIR = Path(__file__).resolve().parents[2] / "openforge" / "db" / "migrations" / "versions"
EXPECTED_MIGRATIONS = [
    "001_initial_schema.py",
    "002_phase1_domain_tables.py",
    "003_phase3_trust_foundations.py",
    "004_phase4_retrieval_reset.py",
    "005_phase5_graph_foundation.py",
    "006_phase7_profile_core.py",
    "007_phase8_artifact_unification.py",
    "008_phase9_workflow_runtime.py",
]


def test_phase_migration_chain_matches_current_release_history() -> None:
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
