#!/usr/bin/env python3
"""Static checks for the normalized OpenForge repository layout."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable


# Root directories
BACKEND_ROOT = Path("backend/openforge")
FRONTEND_ROOT = Path("frontend/src")

EXPECTED_BACKEND_DIRS = {
    "api",
    "common",
    "core",
    "db",
    "domains",
    "infrastructure",
    "integrations",
    "legacy",
    "middleware",
    "runtime",
    "schemas",
    "services",
    "utils",
    "worker",
}

# Expected frontend top-level directories
EXPECTED_FRONTEND_DIRS = {
    "components",
    "features",
    "hooks",
    "lib",
    "pages",
    "stores",
    "styles",
    "types",
}

EXPECTED_DOMAIN_DIRS = {
    "artifacts",
    "common",
    "knowledge",
    "missions",
    "profiles",
    "runs",
    "triggers",
    "workflows",
}

EXPECTED_INFRA_DIRS = {"cache", "db", "mcp", "queue", "search"}
EXPECTED_INTEGRATION_DIRS = {"files", "llm", "tools", "workspace"}
IGNORED_DIR_NAMES = {"__pycache__", ".pytest_cache", ".mypy_cache"}

REQUIRED_BACKEND_FILES = (
    BACKEND_ROOT / "common" / "config" / "__init__.py",
    BACKEND_ROOT / "common" / "config" / "loaders.py",
    BACKEND_ROOT / "common" / "config" / "settings.py",
    BACKEND_ROOT / "common" / "config" / "types.py",
    BACKEND_ROOT / "runtime" / "launching.py",
)

REQUIRED_FRONTEND_FILES = (
    FRONTEND_ROOT / "lib" / "config.ts",
    FRONTEND_ROOT / "lib" / "errors.ts",
    FRONTEND_ROOT / "lib" / "formatters.ts",
    FRONTEND_ROOT / "lib" / "routes.ts",
    FRONTEND_ROOT / "lib" / "status.ts",
)

BANNED_PATHS = (
    BACKEND_ROOT / "api" / "agents.py",
    BACKEND_ROOT / "api" / "agent_schedules.py",
    BACKEND_ROOT / "api" / "targets.py",
    FRONTEND_ROOT / "components" / "agent",
    FRONTEND_ROOT / "pages" / "AgentsPage.tsx",
)


def _iter_directories(root: Path) -> Iterable[Path]:
    for item in root.iterdir():
        if item.is_dir() and item.name not in IGNORED_DIR_NAMES:
            yield item


def check_expected_directories(root: Path, expected: set[str], label: str) -> list[str]:
    errors: list[str] = []
    actual = {item.name for item in _iter_directories(root)}

    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)

    errors.extend(f"Missing {label} directory: {root / name}" for name in missing)
    errors.extend(f"Unexpected {label} directory: {root / name}" for name in unexpected)
    return errors


def check_required_paths(paths: Iterable[Path], label: str) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if not path.exists():
            errors.append(f"Missing required {label}: {path}")
    return errors


def check_banned_paths(paths: Iterable[Path]) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if path.exists():
            errors.append(f"Legacy path should not exist: {path}")
    return errors


def check_placeholder_directories(root: Path) -> list[str]:
    errors: list[str] = []
    for directory in root.rglob("*"):
        if directory.is_dir() and any(char in directory.name for char in "{}"):
            errors.append(f"Placeholder directory should be removed: {directory}")
    return errors


def check_frontend_feature_directories() -> list[str]:
    return check_expected_directories(
        FRONTEND_ROOT / "features",
        {"artifacts", "knowledge", "missions", "profiles", "runs", "workflows"},
        "frontend feature",
    )


def check_legacy_files() -> list[str]:
    """Check that legacy files are properly marked."""
    errors: list[str] = []

    legacy_dir = BACKEND_ROOT / "legacy"
    if not legacy_dir.exists():
        return errors

    for item in legacy_dir.rglob("*.py"):
        if not item.is_file():
            continue
        content = item.read_text(encoding="utf-8", errors="ignore")
        if "LEGACY" not in content and "legacy" not in content.lower():
            errors.append(
                f"Legacy file {item} is not marked as legacy. Add a legacy marker comment."
            )
    return errors


def check_backend_layout() -> list[str]:
    """Check that backend follows the normalized layout."""
    errors: list[str] = []

    if not BACKEND_ROOT.exists():
        return [f"Backend root directory not found: {BACKEND_ROOT}"]

    errors.extend(check_expected_directories(BACKEND_ROOT, EXPECTED_BACKEND_DIRS, "backend"))
    errors.extend(check_expected_directories(BACKEND_ROOT / "domains", EXPECTED_DOMAIN_DIRS, "domain"))
    errors.extend(
        check_expected_directories(
            BACKEND_ROOT / "infrastructure",
            EXPECTED_INFRA_DIRS,
            "infrastructure",
        )
    )
    errors.extend(
        check_expected_directories(
            BACKEND_ROOT / "integrations",
            EXPECTED_INTEGRATION_DIRS,
            "integration",
        )
    )
    errors.extend(check_required_paths(REQUIRED_BACKEND_FILES, "backend file"))
    errors.extend(check_placeholder_directories(BACKEND_ROOT))
    return errors


def check_frontend_layout() -> list[str]:
    """Check that frontend follows the normalized layout."""
    errors: list[str] = []

    if not FRONTEND_ROOT.exists():
        return [f"Frontend root directory not found: {FRONTEND_ROOT}"]

    errors.extend(check_expected_directories(FRONTEND_ROOT, EXPECTED_FRONTEND_DIRS, "frontend"))
    errors.extend(check_required_paths(REQUIRED_FRONTEND_FILES, "frontend file"))
    errors.extend(check_frontend_feature_directories())
    errors.extend(check_placeholder_directories(FRONTEND_ROOT))
    return errors


def main() -> int:
    """Run all checks and return exit code."""
    all_errors: list[str] = []

    print("Checking backend layout...")
    all_errors.extend(check_backend_layout())

    print("Checking frontend layout...")
    all_errors.extend(check_frontend_layout())

    print("Checking banned legacy paths...")
    all_errors.extend(check_banned_paths(BANNED_PATHS))

    print("Checking legacy files...")
    all_errors.extend(check_legacy_files())

    if all_errors:
        print("\nFile organization check failed:")
        for error in all_errors:
            print(f"  - {error}")
        return 1

    print("\nFile organization check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
