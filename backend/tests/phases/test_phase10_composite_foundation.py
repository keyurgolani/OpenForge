from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
VERSIONS_DIR = PROJECT_ROOT / "backend" / "openforge" / "db" / "migrations" / "versions"


def test_phase10_runtime_modules_are_present() -> None:
    for module_name in [
        "openforge.runtime.composite_types",
        "openforge.runtime.state_transfer",
        "openforge.runtime.merge_engine",
        "openforge.runtime.composite_inspector",
        "openforge.runtime.node_executors.delegate_call",
        "openforge.runtime.node_executors.handoff",
        "openforge.runtime.node_executors.fanout",
        "openforge.runtime.node_executors.join",
        "openforge.runtime.node_executors.reduce",
    ]:
        module = import_module(module_name)
        assert module is not None


def test_phase10_docs_exist() -> None:
    for relative_path in [
        "docs/architecture/phase10-delegation-and-composite-execution.md",
        "docs/architecture/phase10-state-transfer-and-merge.md",
        "docs/architecture/phase10-composite-pattern-catalog.md",
    ]:
        assert (PROJECT_ROOT / relative_path).exists(), f"Missing Phase 10 doc: {relative_path}"


def test_phase10_migration_exists() -> None:
    migration = VERSIONS_DIR / "009_phase10_composite_workflows.py"
    assert migration.exists(), "Phase 10 migration missing"
