from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
VERSIONS_DIR = PROJECT_ROOT / "backend" / "openforge" / "db" / "migrations" / "versions"


def test_composite_workflow_runtime_modules_are_present() -> None:
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


def test_composite_workflow_migration_exists() -> None:
    migration = VERSIONS_DIR / "009_composite_workflows.py"
    assert migration.exists(), "Composite workflow migration missing"
