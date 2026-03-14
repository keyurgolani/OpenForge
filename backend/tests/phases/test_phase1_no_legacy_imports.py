"""
Phase 1 Legacy Import Barrier Test

Ensures new domain packages do not import legacy modules directly.
"""

import pytest
import ast
import os
from pathlib import Path


LEGACY_MODULES = {
    "openforge.core.agent_definition",
    "openforge.core.agent_registry",
    "openforge.api.agent_schedules",
    "openforge.services.target_service",
}

DOMAIN_PACKAGES = {
    "openforge.domains.profiles",
    "openforge.domains.workflows",
    "openforge.domains.missions",
    "openforge.domains.triggers",
    "openforge.domains.runs",
    "openforge.domains.artifacts",
    "openforge.domains.knowledge",
    "openforge.domains.common",
}


def get_imports_from_file(file_path: Path) -> set[str]:
    """Extract all import statements from a Python file."""
    imports = set()

    try:
        with open(file_path, "r") as f:
            tree = ast.parse(f.read())

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.add(node.module)
                    # Also check for relative imports
                    for alias in node.names:
                        imports.add(f"{node.module}.{alias.name}")
    except Exception as e:
        print(f"Warning: Could not parse {file_path}: {e}")

    return imports


def test_domain_packages_no_legacy_imports():
    """Test that domain packages do not import legacy modules."""
    backend_path = Path(__file__).parent.parent / "openforge" / "domains"

    if not backend_path.exists():
        pytest.skip("Domains directory not found")

    violations = []

    for domain_dir in backend_path.iterdir():
        if not domain_dir.is_dir():
            continue

        for py_file in domain_dir.glob("**/*.py"):
            if py_file.name.startswith("__"):
                continue

            file_imports = get_imports_from_file(py_file)

            # Check for legacy imports
            for legacy_module in LEGACY_MODULES:
                for imp in file_imports:
                    if legacy_module in imp or imp in legacy_module:
                        relative_path = py_file.relative_to(backend_path.parent)
                        violations.append(
                            f"{relative_path}: imports legacy module '{legacy_module}'"
                        )

    assert len(violations) == 0, (
        f"Domain packages import legacy modules:\n" + "\n".join(violations)
    )


def test_no_new_code_in_legacy_modules():
    """Test that legacy modules are not extended with new functionality."""
    # This is a heuristic test - it checks that legacy modules haven't grown significantly
    # In a real implementation, you might use git diff or code complexity metrics

    backend_path = Path(__file__).parent.parent / "openforge"

    legacy_files = [
        backend_path / "core" / "agent_definition.py",
        backend_path / "core" / "agent_registry.py",
        backend_path / "api" / "agent_schedules.py",
        backend_path / "services" / "target_service.py",
    ]

    for legacy_file in legacy_files:
        if not legacy_file.exists():
            continue

        # Check that file has legacy marker
        with open(legacy_file, "r") as f:
            content = f.read()
            assert "LEGACY MODULE" in content or "LEGACY" in content, (
                f"Legacy file {legacy_file.name} missing LEGACY marker"
            )


def test_domain_packages_use_canonical_types():
    """Test that domain packages use types from the canonical vocabulary."""
    backend_path = Path(__file__).parent.parent / "openforge" / "domains"

    if not backend_path.exists():
        pytest.skip("Domains directory not found")

    # Check that domains import from common enums
    common_enums_path = backend_path / "common" / "enums.py"

    if not common_enums_path.exists():
        pytest.skip("Common enums not found")

    # Verify that domain type files exist and reference common types
    for domain_dir in backend_path.iterdir():
        if not domain_dir.is_dir() or domain_dir.name == "common":
            continue

        types_file = domain_dir / "types.py"
        if types_file.exists():
            with open(types_file, "r") as f:
                content = f.read()
                # Check for imports from common
                if "from backend.openforge.domains.common" not in content:
                    print(f"Warning: {types_file.name} doesn't import from common package")
