from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_phase3_modules_are_importable():
    modules = [
        "openforge.domains.prompts.models",
        "openforge.domains.prompts.schemas",
        "openforge.domains.prompts.service",
        "openforge.domains.prompts.router",
        "openforge.domains.prompts.types",
        "openforge.domains.prompts.rendering",
        "openforge.domains.prompts.seed",
        "openforge.domains.policies.models",
        "openforge.domains.policies.schemas",
        "openforge.domains.policies.service",
        "openforge.domains.policies.router",
        "openforge.domains.policies.types",
        "openforge.domains.policies.evaluator",
        "openforge.domains.policies.approval_service",
        "openforge.runtime.trust_boundaries",
        "openforge.runtime.input_preparation",
    ]

    for module_name in modules:
        module = import_module(module_name)
        assert module is not None


def test_phase3_docs_exist():
    expected = [
        PROJECT_ROOT / "docs" / "architecture" / "phase3-prompt-inventory.md",
        PROJECT_ROOT / "docs" / "architecture" / "phase3-trust-model.md",
        PROJECT_ROOT / "docs" / "product" / "trust-copy-guidelines.md",
    ]

    for doc in expected:
        assert doc.exists(), f"Missing Phase 3 doc: {doc}"


def test_prompt_catalogue_is_no_longer_the_home_of_managed_prompt_bodies():
    catalogue_file = PROJECT_ROOT / "backend" / "openforge" / "core" / "prompt_catalogue.py"
    content = catalogue_file.read_text(encoding="utf-8")

    forbidden_fragments = [
        "You are a capable AI agent integrated into OpenForge",
        "Generate a concise, descriptive title (max 60 chars)",
        "Extract structured insights from this knowledge item.",
    ]

    for fragment in forbidden_fragments:
        assert fragment not in content, f"Prompt fragment still embedded in compatibility layer: {fragment}"


def test_active_runtime_and_services_do_not_import_legacy_prompt_catalogue_bridge():
    backend_root = PROJECT_ROOT / "backend" / "openforge"
    offenders: list[Path] = []

    for py_file in backend_root.rglob("*.py"):
        if py_file.name == "prompt_catalogue.py":
            continue
        content = py_file.read_text(encoding="utf-8")
        if "openforge.core.prompt_catalogue" in content:
            offenders.append(py_file.relative_to(PROJECT_ROOT))

    assert not offenders, (
        "Managed prompt resolution should route through the prompt domain directly. "
        f"Legacy prompt catalogue imports still exist in: {offenders}"
    )
