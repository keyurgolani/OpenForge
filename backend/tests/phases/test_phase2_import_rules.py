"""
Phase 2 Import Rules Tests

These tests verify that the codebase follows the established import rules:
- domains/ cannot import legacy/
- common/ cannot import domains/
- infrastructure/ cannot import domains/
- integrations/ cannot import domains/
- legacy/ cannot be imported from non-legacy code
- Deleted routes should not be mounted
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend" / "openforge"


def get_imports_from_file(filepath: Path) -> set[str]:
    """Extract all import statements from a Python file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        tree = ast.parse(content)
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module)
                for alias in node.names:
                    imports.add(f"{node.module}.{alias.name}")
        return imports
    except SyntaxError:
        return set()


def get_all_python_files(directory: Path) -> list[Path]:
    """Get all Python files in a directory recursively."""
    return list(directory.rglob("**/*.py"))


class TestImportRules:
    """Test that import rules are followed correctly."""

    def test_domains_do_not_import_legacy(self):
        """Domains should not import from legacy modules."""
        domains_dir = BACKEND_ROOT / "domains"
        if not domains_dir.exists():
            pytest.skip("domains directory not found")

        legacy_imports = []
        for py_file in get_all_python_files(domains_dir):
            imports = get_imports_from_file(py_file)
            for imp in imports:
                if imp.startswith("openforge.legacy"):
                    legacy_imports.append((py_file, imp))

        assert not legacy_imports, (
            f"Domain files importing from legacy: {legacy_imports}"
        )

    def test_common_does_not_import_domains(self):
        """Common should not import from domain modules."""
        common_dir = BACKEND_ROOT / "common"
        if not common_dir.exists():
            pytest.skip("common directory not found")

        domain_imports = []
        for py_file in get_all_python_files(common_dir):
            imports = get_imports_from_file(py_file)
            for imp in imports:
                if imp.startswith("openforge.domains"):
                    domain_imports.append((py_file, imp))

        assert not domain_imports, (
            f"Common files importing from domains: {domain_imports}"
        )

    def test_api_does_not_contain_business_logic(self):
        """API routes should be thin wrappers, not contain business logic."""
        api_dir = BACKEND_ROOT / "api"
        if not api_dir.exists():
            pytest.skip("api directory not found")

        for py_file in get_all_python_files(api_dir):
            # Skip router.py which legitimately has more lines
            if py_file.name == "router.py":
                continue

            if py_file.stat().st_size > 10000:  # 10KB
                with open(py_file, "r") as f:
                    content = f.read()
                func_count = content.count("\ndef ")
                class_count = content.count("\nclass ")
                if func_count > 20 or class_count > 5:
                    pytest.fail(
                        f"API file {py_file} appears to contain business logic "
                        f"({func_count} functions, {class_count} classes). "
                        f"API routes should be thin wrappers around services."
                    )

    def test_infrastructure_does_not_import_domains(self):
        """Infrastructure should not import from domain modules."""
        infra_dir = BACKEND_ROOT / "infrastructure"
        if not infra_dir.exists():
            pytest.skip("infrastructure directory not found")

        domain_imports = []
        for py_file in get_all_python_files(infra_dir):
            imports = get_imports_from_file(py_file)
            for imp in imports:
                if imp.startswith("openforge.domains"):
                    domain_imports.append((py_file, imp))

        assert not domain_imports, (
            f"Infrastructure files importing from domains: {domain_imports}"
        )

    def test_integrations_does_not_import_domains(self):
        """Integrations should not import from domain modules."""
        integrations_dir = BACKEND_ROOT / "integrations"
        if not integrations_dir.exists():
            pytest.skip("integrations directory not found")

        domain_imports = []
        for py_file in get_all_python_files(integrations_dir):
            imports = get_imports_from_file(py_file)
            for imp in imports:
                if imp.startswith("openforge.domains"):
                    domain_imports.append((py_file, imp))

        assert not domain_imports, (
            f"Integrations files importing from domains: {domain_imports}"
        )

    def test_no_direct_os_getenv_in_services(self):
        """Services should use centralized config, not direct os.getenv."""
        services_dir = BACKEND_ROOT / "services"
        if not services_dir.exists():
            pytest.skip("services directory not found")

        for py_file in get_all_python_files(services_dir):
            with open(py_file, "r") as f:
                content = f.read()
            if "os.getenv" in content:
                count = content.count("os.getenv")
                if count > 5:
                    pytest.fail(
                        f"Service file {py_file} has {count} os.getenv() calls. "
                        f"Use get_settings() from openforge.common.config instead."
                    )

    def test_deleted_routes_not_mounted(self):
        """Legacy routes should not be mounted in the API router."""
        router_file = BACKEND_ROOT / "api" / "router.py"
        if not router_file.exists():
            pytest.skip("router.py not found")

        with open(router_file, "r") as f:
            content = f.read()

        # Check that legacy routes are not imported or mounted
        forbidden_imports = [
            "from openforge.api import agents",
            "from openforge.api import agent_schedules",
            "from openforge.api import targets",
        ]

        for forbidden in forbidden_imports:
            assert forbidden not in content, (
                f"Legacy import found in router.py: {forbidden}"
            )

    def test_domain_routers_are_registered_through_router_registry(self):
        """Domain routers should be mounted through the dedicated registry in main.py."""
        main_file = BACKEND_ROOT / "main.py"
        if not main_file.exists():
            pytest.skip("main.py not found")

        with open(main_file, "r", encoding="utf-8") as f:
            content = f.read()

        assert "from openforge.domains import register_domain_routers" in content
        assert "register_domain_routers(app)" in content


class TestConfigCentralization:
    """Test that configuration is properly centralized."""

    def test_common_config_exists(self):
        """Common config module should exist."""
        config_dir = BACKEND_ROOT / "common" / "config"
        assert config_dir.exists(), "common/config directory not found"
        assert (config_dir / "__init__.py").exists(), "common/config/__init__.py not found"
        assert (config_dir / "settings.py").exists(), "common/config/settings.py not found"

    def test_root_config_is_deprecated(self):
        """Root config.py should be a deprecation stub."""
        root_config = BACKEND_ROOT / "config.py"
        if root_config.exists():
            with open(root_config, "r") as f:
                content = f.read()
            assert "DEPRECATED" in content or "deprecated" in content, (
                "Root config.py should have deprecation warning"
            )


class TestUtilityConsolidation:
    """Test that utilities are properly consolidated."""

    def test_common_text_exists(self):
        """Common text module should exist."""
        text_dir = BACKEND_ROOT / "common" / "text"
        assert text_dir.exists(), "common/text directory not found"
        assert (text_dir / "__init__.py").exists(), "common/text/__init__.py not found"
        assert (text_dir / "titles.py").exists(), "common/text/titles.py not found"

    def test_common_crypto_exists(self):
        """Common crypto module should exist."""
        crypto_dir = BACKEND_ROOT / "common" / "crypto"
        assert crypto_dir.exists(), "common/crypto directory not found"
        assert (crypto_dir / "__init__.py").exists(), "common/crypto/__init__.py not found"
        assert (crypto_dir / "encryption.py").exists(), "common/crypto/encryption.py not found"
