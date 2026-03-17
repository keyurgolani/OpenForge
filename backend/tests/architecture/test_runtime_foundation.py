from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
VERSIONS_DIR = PROJECT_ROOT / "backend" / "openforge" / "db" / "migrations" / "versions"


def test_workflow_runtime_modules_are_present() -> None:
    for module_name in [
        "openforge.runtime.langgraph_adapter",
        "openforge.runtime.lifecycle",
        "openforge.runtime.event_publisher",
        "openforge.runtime.node_executors.base",
        "openforge.runtime.node_executors.registry",
    ]:
        module = import_module(module_name)
        assert module is not None


def test_workflow_runtime_migration_exists() -> None:
    migration = VERSIONS_DIR / "008_workflow_runtime.py"
    assert migration.exists(), "Workflow runtime migration missing"


def test_old_execution_engine_remains_transitional_for_workflow_runtime() -> None:
    engine_path = PROJECT_ROOT / "backend" / "openforge" / "runtime" / "execution_engine.py"
    content = engine_path.read_text(encoding="utf-8")

    assert "Transitional runtime execution engine" in content
    assert "WorkflowVersionModel" not in content
    assert "RunStepModel" not in content
