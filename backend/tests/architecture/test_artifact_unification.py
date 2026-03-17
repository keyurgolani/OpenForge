from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
VERSIONS_DIR = PROJECT_ROOT / "backend" / "openforge" / "db" / "migrations" / "versions"


def test_artifact_modules_are_present() -> None:
    for module_name in [
        "openforge.domains.artifacts.versioning",
        "openforge.domains.artifacts.lineage",
        "openforge.domains.artifacts.sinks",
        "openforge.domains.artifacts.publishing",
        "openforge.domains.artifacts.seed",
    ]:
        module = import_module(module_name)
        assert module is not None


def test_artifact_unification_migration_exists() -> None:
    migration = VERSIONS_DIR / "007_artifact_unification.py"
    assert migration.exists(), "Artifact unification migration missing"


def test_write_target_tool_no_longer_writes_to_targets_directory() -> None:
    tool_path = PROJECT_ROOT / "tool_server" / "tools" / "agent" / "write_target.py"
    content = tool_path.read_text(encoding="utf-8")

    assert "/targets/" not in content
    assert "targets_root" not in content
    assert "/api/v1/artifacts" in content
