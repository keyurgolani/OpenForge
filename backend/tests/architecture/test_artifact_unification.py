from __future__ import annotations

from importlib import import_module


def test_output_modules_are_present() -> None:
    """Verify the outputs domain modules are importable."""
    for module_name in [
        "openforge.domains.outputs.service",
        "openforge.domains.outputs.router",
        "openforge.domains.outputs.schemas",
        "openforge.domains.outputs.types",
    ]:
        module = import_module(module_name)
        assert module is not None


def test_artifact_backward_compat_shim() -> None:
    """Verify backward-compat imports from artifacts still work."""
    from openforge.domains.artifacts import ArtifactService  # noqa: F401
    assert ArtifactService is not None
