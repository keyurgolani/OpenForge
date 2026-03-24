from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_trust_and_policy_modules_are_importable():
    modules = [
        "openforge.runtime.trust_boundaries",
        "openforge.runtime.input_preparation",
    ]

    for module_name in modules:
        module = import_module(module_name)
        assert module is not None


def test_prompt_catalogue_is_no_longer_the_home_of_managed_prompt_bodies():
    catalogue_file = PROJECT_ROOT / "backend" / "openforge" / "core" / "prompt_catalogue.py"
    if not catalogue_file.exists():
        return  # File has been fully removed, which satisfies this guardrail
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
