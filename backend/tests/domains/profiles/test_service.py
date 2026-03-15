from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import (
    AgentProfileModel,
    CapabilityBundleModel,
    MemoryPolicyModel,
    ModelPolicyModel,
    OutputContractModel,
    SafetyPolicyModel,
)
from openforge.domains.profiles.service import ProfileService

from tests.domains.graph._helpers import FakeAsyncSession


@pytest.mark.asyncio
async def test_resolve_profile_returns_effective_configuration() -> None:
    profile_id = uuid4()
    bundle_id = uuid4()
    model_policy_id = uuid4()
    memory_policy_id = uuid4()
    output_contract_id = uuid4()
    safety_policy_id = uuid4()

    profile = AgentProfileModel(
        id=profile_id,
        name="Workspace Assistant",
        slug="workspace_agent",
        version="1.2.0",
        description="Primary workspace profile",
        role="assistant",
        system_prompt_ref="agent_system",
        capability_bundle_ids=[bundle_id],
        model_policy_id=model_policy_id,
        memory_policy_id=memory_policy_id,
        safety_policy_id=safety_policy_id,
        output_contract_id=output_contract_id,
        is_system=True,
        is_template=False,
        status="active",
    )
    bundle = CapabilityBundleModel(
        id=bundle_id,
        name="Workspace Capabilities",
        slug="workspace_capabilities",
        tools_enabled=True,
        allowed_tool_categories=["agent", "knowledge"],
        blocked_tool_ids=["filesystem.delete"],
        tool_overrides={"filesystem.write": "hitl"},
        skill_ids=["brainstorming"],
        retrieval_enabled=True,
        retrieval_limit=7,
        retrieval_score_threshold=0.4,
        knowledge_scope="workspace",
    )
    model_policy = ModelPolicyModel(
        id=model_policy_id,
        name="Runtime Default",
        slug="runtime_default_model",
        default_model="gpt-5",
        allow_runtime_override=False,
    )
    memory_policy = MemoryPolicyModel(
        id=memory_policy_id,
        name="Interactive Chat",
        slug="interactive_chat_memory",
        history_limit=24,
        attachment_support=True,
        auto_bookmark_urls=True,
        mention_support=False,
    )
    output_contract = OutputContractModel(
        id=output_contract_id,
        name="Streaming Text",
        slug="streaming_text",
        execution_mode="streaming",
        require_structured_output=False,
        require_citations=True,
    )
    safety_policy = SafetyPolicyModel(
        id=safety_policy_id,
        name="Default Runtime Safety",
        scope_type="system",
        scope_id="default_runtime_safety",
        rules=[],
        status="active",
    )

    db = FakeAsyncSession(
        objects={
            (AgentProfileModel, profile_id): profile,
            (CapabilityBundleModel, bundle_id): bundle,
            (ModelPolicyModel, model_policy_id): model_policy,
            (MemoryPolicyModel, memory_policy_id): memory_policy,
            (OutputContractModel, output_contract_id): output_contract,
            (SafetyPolicyModel, safety_policy_id): safety_policy,
        }
    )
    service = ProfileService(db)

    resolved = await service.resolve_profile(profile_id)

    assert resolved is not None
    assert resolved.profile.slug == "workspace_agent"
    assert resolved.profile.version == "1.2.0"
    assert resolved.effective_tools_enabled is True
    assert resolved.effective_allowed_tool_categories == ["agent", "knowledge"]
    assert resolved.effective_blocked_tool_ids == ["filesystem.delete"]
    assert resolved.effective_tool_overrides == {"filesystem.write": "hitl"}
    assert resolved.effective_skill_ids == ["brainstorming"]
    assert resolved.effective_retrieval_enabled is True
    assert resolved.effective_retrieval_limit == 7
    assert resolved.effective_history_limit == 24
    assert resolved.effective_mention_support is False
    assert resolved.effective_default_model == "gpt-5"
    assert resolved.effective_allow_runtime_override is False
    assert resolved.effective_execution_mode == "streaming"


@pytest.mark.asyncio
async def test_validate_profile_completeness_flags_missing_building_blocks() -> None:
    profile_id = uuid4()
    profile = AgentProfileModel(
        id=profile_id,
        name="Incomplete Profile",
        slug="incomplete_profile",
        description="Missing required modular references",
        role="assistant",
        system_prompt_ref=None,
        capability_bundle_ids=[],
        model_policy_id=None,
        memory_policy_id=None,
        safety_policy_id=None,
        output_contract_id=None,
        is_system=False,
        is_template=False,
        status="draft",
    )

    db = FakeAsyncSession(objects={(AgentProfileModel, profile_id): profile})
    service = ProfileService(db)

    validation = await service.validate_profile_completeness(profile_id)

    assert validation["is_complete"] is False
    assert "system_prompt_ref" in validation["missing_fields"]
    assert "capability_bundle_ids" in validation["missing_fields"]
    assert "model_policy_id" in validation["missing_fields"]
    assert "memory_policy_id" in validation["missing_fields"]
    assert "safety_policy_id" in validation["missing_fields"]
    assert "output_contract_id" in validation["missing_fields"]


@pytest.mark.asyncio
async def test_compare_profiles_reports_field_level_differences() -> None:
    left_id = uuid4()
    right_id = uuid4()
    shared_bundle_id = uuid4()

    left = AgentProfileModel(
        id=left_id,
        name="Workspace Assistant",
        slug="workspace_assistant",
        description="Default profile",
        role="assistant",
        system_prompt_ref="workspace_assistant_system",
        capability_bundle_ids=[shared_bundle_id],
        model_policy_id=uuid4(),
        memory_policy_id=uuid4(),
        safety_policy_id=uuid4(),
        output_contract_id=uuid4(),
        is_system=True,
        is_template=False,
        status="active",
    )
    right = AgentProfileModel(
        id=right_id,
        name="Research Specialist",
        slug="research_specialist",
        description="Research profile",
        role="specialist",
        system_prompt_ref="research_system",
        capability_bundle_ids=[],
        model_policy_id=uuid4(),
        memory_policy_id=uuid4(),
        safety_policy_id=uuid4(),
        output_contract_id=uuid4(),
        is_system=False,
        is_template=True,
        status="draft",
    )

    db = FakeAsyncSession(
        objects={
            (AgentProfileModel, left_id): left,
            (AgentProfileModel, right_id): right,
        }
    )
    service = ProfileService(db)

    diff = await service.compare_profiles(left_id, right_id)

    assert diff["left"]["slug"] == "workspace_assistant"
    assert diff["right"]["slug"] == "research_specialist"
    assert diff["differences"]["name"] == {
        "left": "Workspace Assistant",
        "right": "Research Specialist",
    }
    assert diff["differences"]["role"] == {"left": "assistant", "right": "specialist"}
    assert "capability_bundle_ids" in diff["differences"]
