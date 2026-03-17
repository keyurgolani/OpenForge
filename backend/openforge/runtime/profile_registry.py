"""Runtime profile registry built on the agent profile core model."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentProfileModel,
    CapabilityBundleModel,
    MemoryPolicyModel,
    ModelPolicyModel,
    OutputContractModel,
    SafetyPolicyModel,
    Workspace,
)

logger = logging.getLogger("openforge.runtime.profile_registry")


@dataclass(frozen=True)
class BundleSpec:
    slug: str
    name: str
    description: str
    tools_enabled: bool = True
    allowed_tool_categories: list[str] | None = None
    blocked_tool_ids: list[str] = field(default_factory=list)
    tool_overrides: dict[str, str] = field(default_factory=dict)
    max_tool_calls_per_minute: int = 30
    max_tool_calls_per_execution: int = 200
    skill_ids: list[str] = field(default_factory=list)
    retrieval_enabled: bool = True
    retrieval_limit: int = 5
    retrieval_score_threshold: float = 0.35
    knowledge_scope: str = "workspace"


@dataclass(frozen=True)
class ModelPolicySpec:
    slug: str
    name: str
    description: str
    default_model: str | None = None
    allow_runtime_override: bool = True


@dataclass(frozen=True)
class MemoryPolicySpec:
    slug: str
    name: str
    description: str
    history_limit: int = 20
    history_strategy: str = "sliding_window"
    attachment_support: bool = True
    auto_bookmark_urls: bool = True
    mention_support: bool = True


@dataclass(frozen=True)
class OutputContractSpec:
    slug: str
    name: str
    description: str
    execution_mode: str = "streaming"
    require_structured_output: bool = False
    require_citations: bool = False


@dataclass(frozen=True)
class SafetyPolicySpec:
    slug: str
    name: str
    description: str
    rules: list[dict[str, object]] = field(default_factory=list)


@dataclass(frozen=True)
class ProfileSpec:
    slug: str
    name: str
    description: str
    role: str
    system_prompt_ref: str
    capability_bundle_slug: str
    model_policy_slug: str
    memory_policy_slug: str
    output_contract_slug: str
    safety_policy_slug: str
    version: str = "1.0.0"
    max_iterations: int = 20
    icon: str | None = None
    is_default: bool = False


_SYSTEM_BUNDLES = {
    "workspace_capabilities": BundleSpec(
        slug="workspace_capabilities",
        name="Workspace Capabilities",
        description="Full workspace assistant capabilities with tool access and retrieval.",
    ),
    "routing_capabilities": BundleSpec(
        slug="routing_capabilities",
        name="Routing Capabilities",
        description="Delegation-only capability bundle for routing and coordination.",
        allowed_tool_categories=["agent"],
        retrieval_enabled=False,
    ),
    "optimizer_capabilities": BundleSpec(
        slug="optimizer_capabilities",
        name="Optimizer Capabilities",
        description="Prompt optimization bundle without tools or retrieval.",
        tools_enabled=False,
        retrieval_enabled=False,
    ),
}

_SYSTEM_MODEL_POLICIES = {
    "runtime_default_model": ModelPolicySpec(
        slug="runtime_default_model",
        name="Runtime Default Model Policy",
        description="Default model policy for interactive runtime profiles.",
    ),
    "optimizer_default_model": ModelPolicySpec(
        slug="optimizer_default_model",
        name="Optimizer Model Policy",
        description="Default model policy for the prompt optimizer profile.",
    ),
}

_SYSTEM_MEMORY_POLICIES = {
    "interactive_chat_memory": MemoryPolicySpec(
        slug="interactive_chat_memory",
        name="Interactive Chat Memory",
        description="General chat memory policy with attachments, URLs, and mentions enabled.",
        history_limit=20,
    ),
    "coordination_memory": MemoryPolicySpec(
        slug="coordination_memory",
        name="Coordination Memory",
        description="Shorter memory policy for routing and council coordination.",
        history_limit=12,
    ),
    "optimizer_memory": MemoryPolicySpec(
        slug="optimizer_memory",
        name="Optimizer Memory",
        description="Compact prompt-optimization memory policy.",
        history_limit=8,
        attachment_support=False,
        auto_bookmark_urls=False,
        mention_support=False,
    ),
}

_SYSTEM_OUTPUT_CONTRACTS = {
    "streaming_text": OutputContractSpec(
        slug="streaming_text",
        name="Streaming Text",
        description="Default streaming text output.",
    ),
}

_SYSTEM_SAFETY_POLICIES = {
    "default_runtime_safety": SafetyPolicySpec(
        slug="default_runtime_safety",
        name="Default Runtime Safety",
        description="Default runtime safety policy for system profiles.",
    ),
}

_SYSTEM_PROFILE_SPECS = (
    ProfileSpec(
        slug="workspace_agent",
        name="Workspace Assistant",
        description="General-purpose AI assistant with workspace knowledge and tool access.",
        role="assistant",
        system_prompt_ref="agent_system",
        capability_bundle_slug="workspace_capabilities",
        model_policy_slug="runtime_default_model",
        memory_policy_slug="interactive_chat_memory",
        output_contract_slug="streaming_text",
        safety_policy_slug="default_runtime_safety",
        max_iterations=20,
        icon="sparkles",
        is_default=True,
    ),
    ProfileSpec(
        slug="router_agent",
        name="Request Router",
        description="Examines requests and delegates to the most appropriate specialist profile.",
        role="coordinator",
        system_prompt_ref="router_system",
        capability_bundle_slug="routing_capabilities",
        model_policy_slug="runtime_default_model",
        memory_policy_slug="coordination_memory",
        output_contract_slug="streaming_text",
        safety_policy_slug="default_runtime_safety",
        max_iterations=5,
        icon="git-branch",
    ),
    ProfileSpec(
        slug="council_agent",
        name="Response Council",
        description="Compares multiple profile responses and selects the best one.",
        role="reviewer",
        system_prompt_ref="council_system",
        capability_bundle_slug="routing_capabilities",
        model_policy_slug="runtime_default_model",
        memory_policy_slug="coordination_memory",
        output_contract_slug="streaming_text",
        safety_policy_slug="default_runtime_safety",
        max_iterations=15,
        icon="users",
    ),
    ProfileSpec(
        slug="optimizer_agent",
        name="Prompt Optimizer",
        description="Rewrites prompts to be more specific, structured, and effective.",
        role="specialist",
        system_prompt_ref="optimizer_system",
        capability_bundle_slug="optimizer_capabilities",
        model_policy_slug="optimizer_default_model",
        memory_policy_slug="optimizer_memory",
        output_contract_slug="streaming_text",
        safety_policy_slug="default_runtime_safety",
        max_iterations=3,
        icon="wand-2",
    ),
)


@dataclass
class ResolvedAgentProfile:
    """Resolved runtime view of an agent profile and its attached policies."""

    id: str
    slug: str
    name: str
    description: str
    role: str
    version: str = "1.0.0"
    profile_id: UUID | None = None
    system_prompt_ref: str | None = None
    capability_bundle_ids: list[UUID] = field(default_factory=list)
    model_policy_id: UUID | None = None
    memory_policy_id: UUID | None = None
    safety_policy_id: UUID | None = None
    output_contract_id: UUID | None = None
    tools_enabled: bool = False
    allowed_tool_categories: list[str] | None = None
    blocked_tool_ids: list[str] = field(default_factory=list)
    tool_overrides: dict[str, str] = field(default_factory=dict)
    max_tool_calls_per_minute: int = 30
    max_tool_calls_per_execution: int = 200
    skill_ids: list[str] = field(default_factory=list)
    knowledge_scope: str = "workspace"
    rag_enabled: bool = False
    rag_limit: int = 0
    rag_score_threshold: float = 0.35
    history_limit: int = 20
    attachment_support: bool = True
    auto_bookmark_urls: bool = True
    mention_support: bool = True
    provider_override_id: str | None = None
    model_override: str | None = None
    allow_runtime_model_override: bool = True
    execution_mode: str = "streaming"
    require_structured_output: bool = False
    require_citations: bool = False
    max_iterations: int = 20
    is_system: bool = False
    is_template: bool = False
    status: str = "active"
    icon: str | None = None
    is_default: bool = False

    @property
    def system_prompt(self) -> str:
        if not self.system_prompt_ref:
            return ""
        if self.system_prompt_ref.startswith("catalogue:"):
            return self.system_prompt_ref
        return f"catalogue:{self.system_prompt_ref}"

    def merge_workspace_overrides(
        self,
        *,
        agent_enabled: bool = True,
        agent_tool_categories: list[str] | None = None,
        agent_max_tool_loops: int | None = None,
    ) -> "ResolvedAgentProfile":
        return ResolvedAgentProfile(
            **{
                **self.__dict__,
                "tools_enabled": self.tools_enabled if agent_enabled else False,
                "allowed_tool_categories": (
                    list(agent_tool_categories)
                    if agent_tool_categories
                    else self.allowed_tool_categories
                ),
                "max_iterations": agent_max_tool_loops or self.max_iterations,
            }
        )


class ProfileRegistry:
    """Runtime-local registry for resolved profile configurations."""

    def __init__(self) -> None:
        self._profiles: dict[str, ResolvedAgentProfile] = {}

    def register_system_profiles(self) -> None:
        for spec in _SYSTEM_PROFILE_SPECS:
            bundle = _SYSTEM_BUNDLES[spec.capability_bundle_slug]
            model_policy = _SYSTEM_MODEL_POLICIES[spec.model_policy_slug]
            memory_policy = _SYSTEM_MEMORY_POLICIES[spec.memory_policy_slug]
            output_contract = _SYSTEM_OUTPUT_CONTRACTS[spec.output_contract_slug]
            self._profiles[spec.slug] = ResolvedAgentProfile(
                id=spec.slug,
                slug=spec.slug,
                name=spec.name,
                description=spec.description,
                role=spec.role,
                version=spec.version,
                system_prompt_ref=spec.system_prompt_ref,
                tools_enabled=bundle.tools_enabled,
                allowed_tool_categories=list(bundle.allowed_tool_categories) if bundle.allowed_tool_categories else None,
                blocked_tool_ids=list(bundle.blocked_tool_ids),
                tool_overrides=dict(bundle.tool_overrides),
                max_tool_calls_per_minute=bundle.max_tool_calls_per_minute,
                max_tool_calls_per_execution=bundle.max_tool_calls_per_execution,
                skill_ids=list(bundle.skill_ids),
                knowledge_scope=bundle.knowledge_scope,
                rag_enabled=bundle.retrieval_enabled,
                rag_limit=bundle.retrieval_limit,
                rag_score_threshold=bundle.retrieval_score_threshold,
                history_limit=memory_policy.history_limit,
                attachment_support=memory_policy.attachment_support,
                auto_bookmark_urls=memory_policy.auto_bookmark_urls,
                mention_support=memory_policy.mention_support,
                provider_override_id=None,
                model_override=model_policy.default_model,
                allow_runtime_model_override=model_policy.allow_runtime_override,
                execution_mode=output_contract.execution_mode,
                require_structured_output=output_contract.require_structured_output,
                require_citations=output_contract.require_citations,
                max_iterations=spec.max_iterations,
                is_system=True,
                status="active",
                icon=spec.icon,
                is_default=spec.is_default,
            )

    async def ensure_system_profiles(self, db: AsyncSession) -> None:
        bundle_map = {
            slug: await self._upsert_bundle(db, spec)
            for slug, spec in _SYSTEM_BUNDLES.items()
        }
        model_policy_map = {
            slug: await self._upsert_model_policy(db, spec)
            for slug, spec in _SYSTEM_MODEL_POLICIES.items()
        }
        memory_policy_map = {
            slug: await self._upsert_memory_policy(db, spec)
            for slug, spec in _SYSTEM_MEMORY_POLICIES.items()
        }
        output_contract_map = {
            slug: await self._upsert_output_contract(db, spec)
            for slug, spec in _SYSTEM_OUTPUT_CONTRACTS.items()
        }
        safety_policy_map = {
            slug: await self._upsert_safety_policy(db, spec)
            for slug, spec in _SYSTEM_SAFETY_POLICIES.items()
        }

        for spec in _SYSTEM_PROFILE_SPECS:
            await self._upsert_profile(
                db,
                spec=spec,
                bundle=bundle_map[spec.capability_bundle_slug],
                model_policy=model_policy_map[spec.model_policy_slug],
                memory_policy=memory_policy_map[spec.memory_policy_slug],
                output_contract=output_contract_map[spec.output_contract_slug],
                safety_policy=safety_policy_map[spec.safety_policy_slug],
            )

        await db.commit()

    async def load_profiles(self, db: AsyncSession) -> None:
        self._profiles = {}
        self.register_system_profiles()

        result = await db.execute(
            select(AgentProfileModel).where(AgentProfileModel.status != "deleted")
        )
        profiles = list(result.scalars().all())
        if not profiles:
            return

        bundle_rows = list((await db.execute(select(CapabilityBundleModel))).scalars().all())
        model_policy_rows = list((await db.execute(select(ModelPolicyModel))).scalars().all())
        memory_policy_rows = list((await db.execute(select(MemoryPolicyModel))).scalars().all())
        output_contract_rows = list((await db.execute(select(OutputContractModel))).scalars().all())

        bundle_map = {row.id: row for row in bundle_rows}
        model_policy_map = {row.id: row for row in model_policy_rows}
        memory_policy_map = {row.id: row for row in memory_policy_rows}
        output_contract_map = {row.id: row for row in output_contract_rows}

        for profile in profiles:
            resolved = self._resolve_profile(
                profile,
                bundle_map=bundle_map,
                model_policy_map=model_policy_map,
                memory_policy_map=memory_policy_map,
                output_contract_map=output_contract_map,
            )
            self._profiles[resolved.id] = resolved

    async def get_for_workspace(self, db: AsyncSession, workspace_id: UUID) -> ResolvedAgentProfile:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()
        if workspace is None:
            return self.get_default()

        profile = self.get(workspace.agent_id or self.get_default().id) or self.get_default()
        return profile.merge_workspace_overrides(
            agent_enabled=workspace.agent_enabled,
            agent_tool_categories=list(workspace.agent_tool_categories or []),
            agent_max_tool_loops=workspace.agent_max_tool_loops,
        )

    def get(self, profile_id: str) -> ResolvedAgentProfile | None:
        return self._profiles.get(profile_id)

    def get_default(self) -> ResolvedAgentProfile:
        return next((profile for profile in self._profiles.values() if profile.is_default), self._profiles["workspace_agent"])

    def list_all(self) -> list[ResolvedAgentProfile]:
        return list(self._profiles.values())

    def _resolve_profile(
        self,
        profile: AgentProfileModel,
        *,
        bundle_map: dict[UUID, CapabilityBundleModel],
        model_policy_map: dict[UUID, ModelPolicyModel],
        memory_policy_map: dict[UUID, MemoryPolicyModel],
        output_contract_map: dict[UUID, OutputContractModel],
    ) -> ResolvedAgentProfile:
        bundles = [
            bundle_map[resolved_bundle_id]
            for bundle_id in (profile.capability_bundle_ids or [])
            if (resolved_bundle_id := self._coerce_uuid(bundle_id)) and resolved_bundle_id in bundle_map
        ]
        if not bundles:
            bundles = []

        model_policy = model_policy_map.get(profile.model_policy_id) if profile.model_policy_id else None
        memory_policy = memory_policy_map.get(profile.memory_policy_id) if profile.memory_policy_id else None
        output_contract = output_contract_map.get(profile.output_contract_id) if profile.output_contract_id else None

        allowed_categories: list[str] | None = None
        blocked_tool_ids: list[str] = []
        tool_overrides: dict[str, str] = {}
        skill_ids: list[str] = []
        if bundles:
            # If any tool-enabled bundle allows all categories (None), the
            # merged result is also "all categories" (None).
            has_unrestricted = any(
                bundle.allowed_tool_categories is None
                for bundle in bundles
                if bundle.tools_enabled
            )
            if has_unrestricted:
                allowed_categories = None
            else:
                category_values = {
                    category
                    for bundle in bundles
                    for category in (bundle.allowed_tool_categories or [])
                }
                allowed_categories = sorted(category_values) if category_values else None
            blocked_tool_ids = self._dedupe_list(
                tool_id
                for bundle in bundles
                for tool_id in (bundle.blocked_tool_ids or [])
            )
            for bundle in bundles:
                tool_overrides.update(bundle.tool_overrides or {})
                for skill_id in bundle.skill_ids or []:
                    if skill_id not in skill_ids:
                        skill_ids.append(skill_id)

        return ResolvedAgentProfile(
            id=profile.slug,
            slug=profile.slug,
            profile_id=profile.id,
            name=profile.name,
            description=profile.description or "",
            role=profile.role,
            version=profile.version,
            system_prompt_ref=profile.system_prompt_ref,
            capability_bundle_ids=list(profile.capability_bundle_ids or []),
            model_policy_id=profile.model_policy_id,
            memory_policy_id=profile.memory_policy_id,
            safety_policy_id=profile.safety_policy_id,
            output_contract_id=profile.output_contract_id,
            tools_enabled=any(bundle.tools_enabled for bundle in bundles) if bundles else False,
            allowed_tool_categories=allowed_categories,
            blocked_tool_ids=blocked_tool_ids,
            tool_overrides=tool_overrides,
            max_tool_calls_per_minute=min(
                (bundle.max_tool_calls_per_minute for bundle in bundles),
                default=30,
            ),
            max_tool_calls_per_execution=min(
                (bundle.max_tool_calls_per_execution for bundle in bundles),
                default=200,
            ),
            skill_ids=skill_ids,
            knowledge_scope=next((bundle.knowledge_scope for bundle in bundles), "workspace"),
            rag_enabled=any(bundle.retrieval_enabled for bundle in bundles) if bundles else False,
            rag_limit=max((bundle.retrieval_limit for bundle in bundles if bundle.retrieval_enabled), default=0),
            rag_score_threshold=min(
                (bundle.retrieval_score_threshold for bundle in bundles if bundle.retrieval_enabled),
                default=0.35,
            ),
            history_limit=memory_policy.history_limit if memory_policy else 20,
            attachment_support=memory_policy.attachment_support if memory_policy else True,
            auto_bookmark_urls=memory_policy.auto_bookmark_urls if memory_policy else True,
            mention_support=memory_policy.mention_support if memory_policy else True,
            provider_override_id=str(model_policy.default_provider_id) if model_policy and model_policy.default_provider_id else None,
            model_override=model_policy.default_model if model_policy else None,
            allow_runtime_model_override=model_policy.allow_runtime_override if model_policy else True,
            execution_mode=output_contract.execution_mode if output_contract else "streaming",
            require_structured_output=output_contract.require_structured_output if output_contract else False,
            require_citations=output_contract.require_citations if output_contract else False,
            max_iterations=20,
            is_system=profile.is_system,
            is_template=profile.is_template,
            status=profile.status,
            icon=profile.icon,
            is_default=profile.slug == "workspace_agent",
        )

    async def _upsert_bundle(self, db: AsyncSession, spec: BundleSpec) -> CapabilityBundleModel:
        row = await db.scalar(select(CapabilityBundleModel).where(CapabilityBundleModel.slug == spec.slug))
        if row is None:
            row = CapabilityBundleModel(slug=spec.slug)
            db.add(row)
        row.name = spec.name
        row.description = spec.description
        row.tools_enabled = spec.tools_enabled
        row.allowed_tool_categories = spec.allowed_tool_categories
        row.blocked_tool_ids = list(spec.blocked_tool_ids)
        row.tool_overrides = dict(spec.tool_overrides)
        row.max_tool_calls_per_minute = spec.max_tool_calls_per_minute
        row.max_tool_calls_per_execution = spec.max_tool_calls_per_execution
        row.skill_ids = list(spec.skill_ids)
        row.retrieval_enabled = spec.retrieval_enabled
        row.retrieval_limit = spec.retrieval_limit
        row.retrieval_score_threshold = spec.retrieval_score_threshold
        row.knowledge_scope = spec.knowledge_scope
        row.is_system = True
        row.status = "active"
        await db.flush()
        return row

    async def _upsert_model_policy(self, db: AsyncSession, spec: ModelPolicySpec) -> ModelPolicyModel:
        row = await db.scalar(select(ModelPolicyModel).where(ModelPolicyModel.slug == spec.slug))
        if row is None:
            row = ModelPolicyModel(slug=spec.slug)
            db.add(row)
        row.name = spec.name
        row.description = spec.description
        row.default_model = spec.default_model
        row.allow_runtime_override = spec.allow_runtime_override
        row.is_system = True
        row.status = "active"
        await db.flush()
        return row

    async def _upsert_memory_policy(self, db: AsyncSession, spec: MemoryPolicySpec) -> MemoryPolicyModel:
        row = await db.scalar(select(MemoryPolicyModel).where(MemoryPolicyModel.slug == spec.slug))
        if row is None:
            row = MemoryPolicyModel(slug=spec.slug)
            db.add(row)
        row.name = spec.name
        row.description = spec.description
        row.history_limit = spec.history_limit
        row.history_strategy = spec.history_strategy
        row.attachment_support = spec.attachment_support
        row.auto_bookmark_urls = spec.auto_bookmark_urls
        row.mention_support = spec.mention_support
        row.is_system = True
        row.status = "active"
        await db.flush()
        return row

    async def _upsert_output_contract(self, db: AsyncSession, spec: OutputContractSpec) -> OutputContractModel:
        row = await db.scalar(select(OutputContractModel).where(OutputContractModel.slug == spec.slug))
        if row is None:
            row = OutputContractModel(slug=spec.slug)
            db.add(row)
        row.name = spec.name
        row.description = spec.description
        row.execution_mode = spec.execution_mode
        row.require_structured_output = spec.require_structured_output
        row.require_citations = spec.require_citations
        row.is_system = True
        row.status = "active"
        await db.flush()
        return row

    async def _upsert_safety_policy(self, db: AsyncSession, spec: SafetyPolicySpec) -> SafetyPolicyModel:
        row = await db.scalar(select(SafetyPolicyModel).where(SafetyPolicyModel.name == spec.name))
        if row is None:
            row = SafetyPolicyModel(name=spec.name)
            db.add(row)
        row.description = spec.description
        row.scope_type = "system"
        row.scope_id = spec.slug
        row.rules = list(spec.rules)
        row.status = "active"
        await db.flush()
        return row

    async def _upsert_profile(
        self,
        db: AsyncSession,
        *,
        spec: ProfileSpec,
        bundle: CapabilityBundleModel,
        model_policy: ModelPolicyModel,
        memory_policy: MemoryPolicyModel,
        output_contract: OutputContractModel,
        safety_policy: SafetyPolicyModel,
    ) -> AgentProfileModel:
        row = await db.scalar(select(AgentProfileModel).where(AgentProfileModel.slug == spec.slug))
        if row is None:
            row = AgentProfileModel(slug=spec.slug, name=spec.name)
            db.add(row)
        row.name = spec.name
        row.description = spec.description
        row.version = spec.version
        row.role = spec.role
        row.system_prompt_ref = spec.system_prompt_ref
        row.capability_bundle_ids = [bundle.id]
        row.model_policy_id = model_policy.id
        row.memory_policy_id = memory_policy.id
        row.safety_policy_id = safety_policy.id
        row.output_contract_id = output_contract.id
        row.is_system = True
        row.is_template = False
        row.status = "active"
        row.icon = spec.icon
        await db.flush()
        return row

    def _dedupe_list(self, values) -> list[str]:
        ordered: list[str] = []
        seen: set[str] = set()
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            ordered.append(value)
        return ordered

    def _coerce_uuid(self, value: object) -> UUID | None:
        if isinstance(value, UUID):
            return value
        if isinstance(value, str):
            try:
                return UUID(value)
            except ValueError:
                return None
        return None


profile_registry = ProfileRegistry()
