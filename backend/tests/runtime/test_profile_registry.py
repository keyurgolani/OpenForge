from __future__ import annotations

from openforge.runtime.profile_registry import ProfileRegistry


def test_register_system_profiles_builds_default_runtime_profiles() -> None:
    registry = ProfileRegistry()

    registry.register_system_profiles()

    default_profile = registry.get_default()
    optimizer = registry.get("optimizer_agent")

    assert default_profile.id == "workspace_agent"
    assert default_profile.system_prompt == "catalogue:agent_system"
    assert default_profile.tools_enabled is True
    assert default_profile.rag_enabled is True
    assert default_profile.max_iterations == 20

    assert optimizer is not None
    assert optimizer.tools_enabled is False
    assert optimizer.rag_enabled is False
    assert optimizer.max_iterations == 3
