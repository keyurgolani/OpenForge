"""
Structural Cleanup Protection Tests

These tests ensure that the cleanup work is maintained:
- No duplicate utility implementations
- Frontend file organization is maintained
- No dead code patterns
- Service ownership boundaries are respected
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from openforge.db.models import Base


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend" / "openforge"
FRONTEND_ROOT = PROJECT_ROOT / "frontend" / "src"

TIME_HELPERS = {
    "from_isoformat",
    "format_timestamp",
    "timestamp_filename",
    "to_isoformat",
    "utc_now",
}

ID_HELPERS = {
    "generate_id",
    "generate_short_id",
    "parse_uuid",
    "validate_uuid",
}

JSON_HELPERS = {
    "from_json",
    "safe_json_dict",
    "to_json",
}


def get_all_python_files(directory: Path) -> list[Path]:
    """Get all Python files in a directory recursively."""
    return list(directory.rglob("**/*.py"))


def get_all_tsx_files(directory: Path) -> list[Path]:
    """Get all TypeScript/TSX files in a directory recursively."""
    return list(directory.rglob("**/*.tsx")) + list(directory.rglob("**/*.ts"))


def get_defined_functions(filepath: Path) -> set[str]:
    """Extract all function definitions from a Python file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        tree = ast.parse(content)
        functions = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                functions.add(node.name)
        return functions
    except SyntaxError:
        return set()


def find_duplicate_helper_definitions(shared_module: Path, helper_names: set[str]) -> list[tuple[Path, list[str]]]:
    """Find helper functions defined outside their shared owner module."""
    duplicates: list[tuple[Path, list[str]]] = []

    for py_file in get_all_python_files(BACKEND_ROOT):
        if py_file == shared_module or py_file.name == "__init__.py":
            continue

        overlap = sorted(helper_names & get_defined_functions(py_file))
        if overlap:
            duplicates.append((py_file, overlap))

    return duplicates


class TestNoDuplicateUtilities:
    """Test that there are no duplicate utility implementations."""

    def test_no_duplicate_time_helpers(self):
        """Time helpers should only exist in common/time."""
        time_module = BACKEND_ROOT / "common" / "time" / "__init__.py"
        if not time_module.exists():
            pytest.skip("common/time directory not found")

        duplicates = find_duplicate_helper_definitions(time_module, TIME_HELPERS)
        assert not duplicates, (
            f"Duplicate time helpers found outside common/time: {duplicates}. "
            f"Move shared time helpers into {time_module}."
        )

    def test_no_duplicate_id_helpers(self):
        """ID helpers should only exist in common/ids."""
        ids_module = BACKEND_ROOT / "common" / "ids" / "__init__.py"
        if not ids_module.exists():
            pytest.skip("common/ids directory not found")

        duplicates = find_duplicate_helper_definitions(ids_module, ID_HELPERS)
        assert not duplicates, (
            f"Duplicate ID helpers found outside common/ids: {duplicates}. "
            f"Move shared ID helpers into {ids_module}."
        )

    def test_no_duplicate_json_helpers(self):
        """JSON helpers should only exist in common/json."""
        json_module = BACKEND_ROOT / "common" / "json" / "__init__.py"
        if not json_module.exists():
            pytest.skip("common/json directory not found")

        duplicates = find_duplicate_helper_definitions(json_module, JSON_HELPERS)
        assert not duplicates, (
            f"Duplicate JSON helpers found outside common/json: {duplicates}. "
            f"Move shared JSON helpers into {json_module}."
        )


class TestFrontendFileOrganization:
    """Test that frontend files are properly organized."""

    def test_no_legacy_agent_components(self):
        """Legacy agent components should not exist."""
        agent_dir = FRONTEND_ROOT / "components" / "agent"
        if agent_dir.exists():
            pytest.fail(
                f"Legacy agent components directory exists: {agent_dir}. "
                f"Delete this directory as it's no longer needed."
            )

    def test_no_legacy_target_components(self):
        """Legacy target components should not exist."""
        target_dir = FRONTEND_ROOT / "components" / "target"
        if target_dir.exists():
            pytest.fail(
                f"Legacy target components directory exists: {target_dir}. "
                f"Delete this directory as it's no longer needed."
            )

    def test_no_legacy_agent_components_page(self):
        """Legacy agent component pages should not exist."""
        legacy_page = FRONTEND_ROOT / "pages" / "AgentExecutionsPage.tsx"
        if legacy_page.exists():
            pytest.fail(
                f"Legacy AgentExecutionsPage exists: {legacy_page}. "
                f"Delete this page as it's no longer needed."
            )

    def test_no_legacy_target_pages(self):
        """Legacy target pages should not exist."""
        targets_page = FRONTEND_ROOT / "pages" / "TargetsPage.tsx"
        if targets_page.exists():
            pytest.fail(
                f"Legacy TargetsPage exists: {targets_page}. "
                f"Delete this page as it's no longer needed."
            )

    def test_features_directory_exists(self):
        """Features directory should exist for domain-specific UI logic."""
        features_dir = FRONTEND_ROOT / "features"
        assert features_dir.exists(), "features directory not found"

        # Check that domain features exist
        expected_features = ["agents", "automations", "runs", "outputs", "knowledge"]
        for feature in expected_features:
            feature_dir = features_dir / feature
            assert feature_dir.exists(), f"Feature directory not found: {feature}"

    def test_domain_page_shells_exist(self):
        """Canonical domain page shells should exist."""
        expected_pages = [
            "DashboardPage.tsx",
            "AgentsPage.tsx",
            "AutomationsPage.tsx",
            "RunsPage.tsx",
            "OutputsPage.tsx",
        ]
        pages_dir = FRONTEND_ROOT / "pages"
        for page in expected_pages:
            assert (pages_dir / page).exists(), f"Expected page shell not found: {page}"

    def test_route_helpers_use_canonical_workspace_prefix(self):
        """Frontend route helpers should use /w/:workspaceId as the canonical prefix."""
        routes_file = FRONTEND_ROOT / "lib" / "routes.ts"
        content = routes_file.read_text(encoding="utf-8")

        assert "/w/:workspaceId" in content
        assert "/workspaces/:workspaceId" not in content

    def test_main_mounts_canonical_workspace_routes(self):
        """The main router should mount the canonical final-domain pages."""
        main_file = FRONTEND_ROOT / "main.tsx"
        content = main_file.read_text(encoding="utf-8")

        for segment in ['path="knowledge"', 'path="chat"', 'path="/agents"', 'path="/automations"', 'path="/runs"', 'path="/outputs"']:
            assert segment in content, f"Expected route segment missing from main.tsx: {segment}"

        assert '/executions' not in content

    def test_app_shell_primary_navigation_uses_final_labels(self):
        """AppShell should use the final IA labels rather than the legacy agent/execution framing."""
        app_shell = (FRONTEND_ROOT / "pages" / "AppShell.tsx").read_text(encoding="utf-8")

        for label in ["Knowledge", "Chat", "Agents", "Automations", "Runs", "Outputs", "Settings"]:
            assert label in app_shell, f"Expected navigation label missing from AppShell: {label}"

        assert "Legacy Executions" not in app_shell

    def test_workspace_websocket_hook_requires_explicit_channels(self):
        """Frontend should connect through the separated agent/system channels only."""
        hook_file = FRONTEND_ROOT / "hooks" / "useWorkspaceWebSocket.ts"
        content = hook_file.read_text(encoding="utf-8")

        assert "channel?: 'agent' | 'system'" not in content
        assert "channel: 'agent' | 'system'" in content
        assert "/ws/workspace/${workspaceId}/${channel}" in content
        assert ":legacy" not in content

    def test_no_tracked_legacy_runtime_package(self):
        """Structural cleanup should not preserve an empty legacy compatibility package."""
        legacy_init = BACKEND_ROOT / "legacy" / "__init__.py"
        assert not legacy_init.exists(), (
            "backend/openforge/legacy/__init__.py should stay deleted unless a real quarantine module is reintroduced."
        )


class TestServiceOwnership:
    """Test that service ownership boundaries are respected."""

    def test_no_duplicate_conversation_services(self):
        """Conversation services should not be duplicated."""
        conversation_services = []
        for py_file in get_all_python_files(BACKEND_ROOT):
            if "conversation" in py_file.name.lower() and "service" in py_file.name.lower():
                conversation_services.append(py_file)

        # Should only have one conversation service
        assert len(conversation_services) <= 1, (
            f"Multiple conversation services found: {conversation_services}. "
            f"Consolidate into a single service."
        )

    def test_no_duplicate_knowledge_services(self):
        """Knowledge services should not be duplicated."""
        allowed_services = {"knowledge_processing_service.py", "knowledge_service.py"}
        knowledge_services = []
        for py_file in get_all_python_files(BACKEND_ROOT):
            if "knowledge" in py_file.name.lower() and "service" in py_file.name.lower():
                knowledge_services.append(py_file)

        unexpected = sorted(
            str(path.relative_to(BACKEND_ROOT))
            for path in knowledge_services
            if path.name not in allowed_services
        )

        assert not unexpected, (
            f"Unexpected knowledge service modules found: {unexpected}. "
            f"Knowledge ownership should stay within the approved service set."
        )

    def test_no_duplicate_llm_services(self):
        """LLM services should not be duplicated."""
        llm_services = []
        for py_file in get_all_python_files(BACKEND_ROOT):
            if "llm" in py_file.name.lower() and "service" in py_file.name.lower():
                llm_services.append(py_file)

        # Should only have one LLM service
        assert len(llm_services) <= 1, (
            f"Multiple LLM services found: {llm_services}. "
            f"Consolidate into a single service."
        )


class TestNoDeadCode:
    """Test that there is no dead code in the codebase."""

    def test_no_empty_init_files(self):
        """__init__.py files should not be empty."""
        for py_file in get_all_python_files(BACKEND_ROOT):
            if py_file.name == "__init__.py":
                with open(py_file, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                if not content:
                    pytest.fail(
                        f"Empty __init__.py file found: {py_file}. "
                        f"Add module documentation or delete the file."
                    )

    def test_no_unused_imports_in_services(self):
        """Services should not have unused imports."""
        services_dir = BACKEND_ROOT / "services"
        if not services_dir.exists():
            pytest.skip("services directory not found")

        for py_file in get_all_python_files(services_dir):
            if py_file.name == "__init__.py":
                continue

            with open(py_file, "r") as f:
                content = f.read()

            # Check for common unused import patterns
            unused_patterns = [
                r"import.*unused",
                r"from.*import.*unused",
            ]

            for pattern in unused_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    pytest.fail(
                        f"File {py_file} appears to have unused imports. "
                        f"Clean up unused imports."
                    )


class TestConfigurationCentralization:
    """Test that configuration is properly centralized."""

    def test_no_direct_os_getenv_in_domains(self):
        """Domain modules should not use os.getenv directly."""
        domains_dir = BACKEND_ROOT / "domains"
        if not domains_dir.exists():
            pytest.skip("domains directory not found")

        for py_file in get_all_python_files(domains_dir):
            if py_file.name == "__init__.py":
                continue

            with open(py_file, "r") as f:
                content = f.read()

            if "os.getenv" in content:
                count = content.count("os.getenv")
                if count > 0:
                    pytest.fail(
                        f"Domain file {py_file} has {count} os.getenv() calls. "
                        f"Use get_settings() from openforge.common.config instead."
                    )

    def test_no_direct_os_getenv_in_integrations(self):
        """Integration modules should not use os.getenv directly."""
        integrations_dir = BACKEND_ROOT / "integrations"
        if not integrations_dir.exists():
            pytest.skip("integrations directory not found")

        for py_file in get_all_python_files(integrations_dir):
            if py_file.name == "__init__.py":
                continue

            with open(py_file, "r") as f:
                content = f.read()

            if "os.getenv" in content:
                count = content.count("os.getenv")
                if count > 0:
                    pytest.fail(
                        f"Integration file {py_file} has {count} os.getenv() calls. "
                        f"Use get_settings() from openforge.common.config instead."
                    )


class TestRetrievalGuardrails:
    """Guardrails that keep retrieval behavior explicit."""

    def test_context_assembler_has_no_dead_rag_results_path(self):
        context_assembler = (BACKEND_ROOT / "core" / "context_assembler.py").read_text(encoding="utf-8")
        assert "rag_results" not in context_assembler

    def test_retrieval_search_engine_import_is_confined_to_allowed_boundaries(self):
        allowed = {
            BACKEND_ROOT / "api" / "search.py",
            BACKEND_ROOT / "domains" / "retrieval" / "service.py",
            PROJECT_ROOT / "backend" / "tests" / "api" / "test_api_integration.py",
        }

        offenders = []
        for py_file in get_all_python_files(BACKEND_ROOT):
            content = py_file.read_text(encoding="utf-8")
            if "from openforge.core.search_engine import search_engine" in content and py_file not in allowed:
                offenders.append(py_file)

        assert not offenders, (
            f"Direct search_engine imports found outside retrieval boundaries: {offenders}. "
            "Route retrieval through openforge.domains.retrieval.service instead."
        )


class TestLegacySchemaRemoval:
    """Guardrails for removing legacy agent-centric schema from active architecture."""

    def test_active_sqlalchemy_metadata_excludes_removed_agent_tables(self):
        tables = set(Base.metadata.tables.keys())

        for legacy_table in {"agent_definitions", "agent_schedules"}:
            assert legacy_table not in tables, (
                f"Legacy table {legacy_table!r} is still part of active SQLAlchemy metadata. "
                "Architecture rules require those agent-centric tables to be removed from the active architecture."
            )

    def test_initial_migration_no_longer_creates_removed_agent_tables(self):
        migration = (
            PROJECT_ROOT
            / "backend"
            / "openforge"
            / "db"
            / "migrations"
            / "versions"
            / "001_initial_schema.py"
        )
        content = migration.read_text(encoding="utf-8")

        for legacy_table in {"agent_definitions", "agent_schedules", "continuous_targets"}:
            assert legacy_table not in content, (
                f"Legacy table {legacy_table!r} is still created in the initial migration. "
                "The pre-release schema should match the final nouns, not preserve removed agent-era tables."
            )
