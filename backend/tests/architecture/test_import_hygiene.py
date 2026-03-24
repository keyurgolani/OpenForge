"""
Domain architecture import guardrails.
"""

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOMAINS_ROOT = PROJECT_ROOT / "openforge" / "domains"
LEGACY_PATHS = {
    "openforge.core.agent_definition",
    "openforge.core.agent_registry",
    "openforge.services.agent_execution_engine",
    "openforge.services.agent_relay",
    "openforge.services.onboarding_service",
    "openforge.services.target_service",
    "openforge.api.agent_schedules",
    "openforge.api.agent",
    "openforge.api.tool_permissions",
}


def get_imports(filepath: Path) -> set[str]:
    tree = ast.parse(filepath.read_text(encoding="utf-8"))
    imports: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module)
            for alias in node.names:
                imports.add(f"{node.module}.{alias.name}")

    return imports


def test_domain_packages_do_not_import_legacy_modules():
    """New domain packages must not depend on explicitly legacy modules."""
    violations: list[str] = []

    for py_file in DOMAINS_ROOT.rglob("*.py"):
        if py_file.name == "__pycache__":
            continue

        imports = get_imports(py_file)
        for legacy in LEGACY_PATHS:
            if any(imp == legacy or imp.startswith(f"{legacy}.") for imp in imports):
                violations.append(f"{py_file.relative_to(PROJECT_ROOT)} imports {legacy}")

    assert not violations, "\n".join(violations)


def test_active_code_does_not_use_backend_openforge_import_root():
    """Active package code should import from openforge.*, not backend.openforge.*."""
    violations: list[str] = []

    for py_file in (PROJECT_ROOT / "openforge").rglob("*.py"):
        imports = get_imports(py_file)
        bad_imports = sorted(imp for imp in imports if imp.startswith("backend.openforge"))
        if bad_imports:
            violations.append(
                f"{py_file.relative_to(PROJECT_ROOT)} imports {', '.join(bad_imports)}"
            )

    assert not violations, "\n".join(violations)


def test_active_backend_code_does_not_import_deleted_legacy_modules():
    """Active backend code should not depend on deleted compatibility modules."""
    violations: list[str] = []

    for py_file in (PROJECT_ROOT / "openforge").rglob("*.py"):
        if "legacy" in py_file.parts:
            continue

        imports = get_imports(py_file)
        for legacy in LEGACY_PATHS:
            if any(imp == legacy or imp.startswith(f"{legacy}.") for imp in imports):
                violations.append(f"{py_file.relative_to(PROJECT_ROOT)} imports {legacy}")

    assert not violations, "\n".join(sorted(violations))
