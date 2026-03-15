"""Profile domain service."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select, func

from openforge.db.models import (
    AgentProfileModel,
    CapabilityBundleModel,
    MemoryPolicyModel,
    ModelPolicyModel,
    OutputContractModel,
    SafetyPolicyModel,
)
from openforge.domains.common.crud import CrudDomainService
from .schemas import ResolvedProfileResponse


class ProfileService(CrudDomainService):
    """Service for managing agent profiles and resolving effective configuration."""

    model = AgentProfileModel

    async def list_profiles(
        self,
        skip: int = 0,
        limit: int = 100,
        is_system: bool | None = None,
        is_template: bool | None = None,
        is_featured: bool | None = None,
        tags: list[str] | None = None,
        status: str | None = None,
    ):
        query = select(AgentProfileModel).order_by(
            AgentProfileModel.sort_priority.desc(),
            AgentProfileModel.updated_at.desc(),
        )
        count_query = select(func.count()).select_from(AgentProfileModel)

        if is_system is not None:
            query = query.where(AgentProfileModel.is_system == is_system)
            count_query = count_query.where(AgentProfileModel.is_system == is_system)
        if is_template is not None:
            query = query.where(AgentProfileModel.is_template == is_template)
            count_query = count_query.where(AgentProfileModel.is_template == is_template)
        if is_featured is not None:
            query = query.where(AgentProfileModel.is_featured == is_featured)
            count_query = count_query.where(AgentProfileModel.is_featured == is_featured)
        if status is not None:
            query = query.where(AgentProfileModel.status == status)
            count_query = count_query.where(AgentProfileModel.status == status)
        if tags:
            for tag in tags:
                query = query.where(AgentProfileModel.tags.contains([tag]))
                count_query = count_query.where(AgentProfileModel.tags.contains([tag]))

        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

    async def get_profile(self, profile_id: UUID):
        return await self.get_record(profile_id)

    async def get_profile_by_slug(self, slug: str) -> dict[str, Any] | None:
        row = await self.db.scalar(select(AgentProfileModel).where(AgentProfileModel.slug == slug))
        return self._serialize(row) if row else None

    async def create_profile(self, profile_data: dict[str, Any]):
        return await self.create_record(profile_data)

    async def update_profile(self, profile_id: UUID, profile_data: dict[str, Any]):
        return await self.update_record(profile_id, profile_data)

    async def delete_profile(self, profile_id: UUID):
        return await self.delete_record(profile_id)

    # ── Template/Catalog operations ──

    async def list_templates(
        self,
        skip: int = 0,
        limit: int = 100,
        tags: list[str] | None = None,
        is_featured: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """List profile templates (is_template=True)."""
        return await self.list_profiles(
            skip=skip,
            limit=limit,
            is_template=True,
            tags=tags,
            is_featured=is_featured,
        )

    async def get_template(self, profile_id: UUID) -> dict[str, Any] | None:
        """Get a single profile template."""
        profile = await self.get_profile(profile_id)
        if profile is None or not profile.get("is_template"):
            return None
        return profile

    async def clone_template(self, profile_id: UUID, clone_data: dict[str, Any]) -> dict[str, Any] | None:
        """Clone a template profile into a user-owned copy."""
        template = await self.get_template(profile_id)
        if template is None:
            return None

        clone_payload = {
            "name": clone_data.get("name") or template["name"],
            "slug": clone_data.get("slug") or f"{template['slug']}-clone",
            "description": template.get("description"),
            "version": "1.0.0",
            "role": template.get("role", "assistant"),
            "system_prompt_ref": template.get("system_prompt_ref"),
            "model_policy_id": template.get("model_policy_id"),
            "memory_policy_id": template.get("memory_policy_id"),
            "safety_policy_id": template.get("safety_policy_id"),
            "capability_bundle_ids": list(template.get("capability_bundle_ids") or []),
            "output_contract_id": template.get("output_contract_id"),
            "is_system": False,
            "is_template": False,
            "status": "draft",
            "icon": template.get("icon"),
            "tags": list(template.get("tags") or []),
            "catalog_metadata": {
                **(template.get("catalog_metadata") or {}),
                "cloned_from_template": str(profile_id),
            },
        }
        return await self.create_profile(clone_payload)

    # ── Resolution & Validation ──

    async def resolve_profile(self, profile_id: UUID) -> ResolvedProfileResponse | None:
        profile = await self.db.get(AgentProfileModel, profile_id)
        if profile is None:
            return None

        bundle_ids = [self._coerce_uuid(bundle_id) for bundle_id in (profile.capability_bundle_ids or [])]
        resolved_bundle_ids = [bundle_id for bundle_id in bundle_ids if bundle_id is not None]

        capability_bundles = []
        for bundle_id in resolved_bundle_ids:
            bundle = await self.db.get(CapabilityBundleModel, bundle_id)
            if bundle is not None:
                capability_bundles.append(bundle)

        model_policy = await self.db.get(ModelPolicyModel, profile.model_policy_id) if profile.model_policy_id else None
        memory_policy = await self.db.get(MemoryPolicyModel, profile.memory_policy_id) if profile.memory_policy_id else None
        safety_policy = await self.db.get(SafetyPolicyModel, profile.safety_policy_id) if profile.safety_policy_id else None
        output_contract = await self.db.get(OutputContractModel, profile.output_contract_id) if profile.output_contract_id else None

        effective_allowed_categories = sorted(
            {
                category
                for bundle in capability_bundles
                for category in (bundle.allowed_tool_categories or [])
            }
        ) or None
        effective_blocked_tool_ids = self._dedupe_list(
            tool_id
            for bundle in capability_bundles
            for tool_id in (bundle.blocked_tool_ids or [])
        )
        effective_tool_overrides: dict[str, str] = {}
        effective_skill_ids: list[str] = []
        for bundle in capability_bundles:
            effective_tool_overrides.update(bundle.tool_overrides or {})
            for skill_id in bundle.skill_ids or []:
                if skill_id not in effective_skill_ids:
                    effective_skill_ids.append(skill_id)

        return ResolvedProfileResponse(
            profile=self._serialize(profile),
            capability_bundles=[self._serialize_model(bundle) for bundle in capability_bundles],
            model_policy=self._serialize_model(model_policy) if model_policy else None,
            memory_policy=self._serialize_model(memory_policy) if memory_policy else None,
            safety_policy=self._serialize_model(safety_policy) if safety_policy else None,
            output_contract=self._serialize_model(output_contract) if output_contract else None,
            effective_tools_enabled=any(bundle.tools_enabled for bundle in capability_bundles) if capability_bundles else False,
            effective_allowed_tool_categories=effective_allowed_categories,
            effective_blocked_tool_ids=effective_blocked_tool_ids,
            effective_tool_overrides=effective_tool_overrides,
            effective_skill_ids=effective_skill_ids,
            effective_retrieval_enabled=any(bundle.retrieval_enabled for bundle in capability_bundles) if capability_bundles else False,
            effective_retrieval_limit=max(
                (bundle.retrieval_limit for bundle in capability_bundles if bundle.retrieval_enabled),
                default=0,
            ),
            effective_retrieval_score_threshold=min(
                (bundle.retrieval_score_threshold for bundle in capability_bundles if bundle.retrieval_enabled),
                default=0.35,
            ),
            effective_knowledge_scope=next((bundle.knowledge_scope for bundle in capability_bundles), "workspace"),
            effective_history_limit=memory_policy.history_limit if memory_policy else 20,
            effective_attachment_support=memory_policy.attachment_support if memory_policy else True,
            effective_auto_bookmark_urls=memory_policy.auto_bookmark_urls if memory_policy else True,
            effective_mention_support=memory_policy.mention_support if memory_policy else True,
            effective_default_model=model_policy.default_model if model_policy else None,
            effective_allow_runtime_override=model_policy.allow_runtime_override if model_policy else True,
            effective_execution_mode=output_contract.execution_mode if output_contract else "streaming",
        )

    async def validate_profile_completeness(self, profile_id: UUID) -> dict[str, Any] | None:
        profile = await self.db.get(AgentProfileModel, profile_id)
        if profile is None:
            return None

        missing_fields: list[str] = []
        invalid_references: list[str] = []

        if not profile.system_prompt_ref:
            missing_fields.append("system_prompt_ref")
        if not profile.capability_bundle_ids:
            missing_fields.append("capability_bundle_ids")
        if not profile.model_policy_id:
            missing_fields.append("model_policy_id")
        if not profile.memory_policy_id:
            missing_fields.append("memory_policy_id")
        if not profile.safety_policy_id:
            missing_fields.append("safety_policy_id")
        if not profile.output_contract_id:
            missing_fields.append("output_contract_id")

        bundle_ids = [self._coerce_uuid(bundle_id) for bundle_id in (profile.capability_bundle_ids or [])]
        resolved_bundle_ids = [bundle_id for bundle_id in bundle_ids if bundle_id is not None]
        if len(resolved_bundle_ids) != len(profile.capability_bundle_ids or []):
            invalid_references.append("capability_bundle_ids")
        for bundle_id in resolved_bundle_ids:
            bundle = await self.db.get(CapabilityBundleModel, bundle_id)
            if bundle is None:
                invalid_references.append("capability_bundle_ids")
                break

        reference_checks = (
            ("model_policy_id", ModelPolicyModel, profile.model_policy_id),
            ("memory_policy_id", MemoryPolicyModel, profile.memory_policy_id),
            ("safety_policy_id", SafetyPolicyModel, profile.safety_policy_id),
            ("output_contract_id", OutputContractModel, profile.output_contract_id),
        )
        for field_name, model, reference_id in reference_checks:
            if reference_id is None:
                continue
            if await self.db.get(model, reference_id) is None:
                invalid_references.append(field_name)

        warnings: list[str] = []
        if profile.status != "active":
            warnings.append("Profile is not active.")
        if profile.is_template:
            warnings.append("Profile is marked as a template.")

        invalid_references = self._dedupe_list(invalid_references)
        return {
            "profile_id": profile.id,
            "is_complete": not missing_fields and not invalid_references,
            "missing_fields": missing_fields,
            "invalid_references": invalid_references,
            "warnings": warnings,
        }

    async def compare_profiles(self, left_profile_id: UUID, right_profile_id: UUID) -> dict[str, Any] | None:
        left = await self.db.get(AgentProfileModel, left_profile_id)
        right = await self.db.get(AgentProfileModel, right_profile_id)
        if left is None or right is None:
            return None

        left_data = self._serialize_model(left)
        right_data = self._serialize_model(right)

        differences: dict[str, dict[str, Any]] = {}
        compared_fields = sorted(set(left_data) | set(right_data))
        for field_name in compared_fields:
            if left_data.get(field_name) == right_data.get(field_name):
                continue
            differences[field_name] = {
                "left": left_data.get(field_name),
                "right": right_data.get(field_name),
            }

        return {
            "left": left_data,
            "right": right_data,
            "differences": differences,
        }

    def _serialize(self, instance: Any) -> dict[str, Any]:
        data = super()._serialize(instance)
        if isinstance(instance, AgentProfileModel):
            data["tags"] = data.get("tags") or []
            data["catalog_metadata"] = data.get("catalog_metadata") or {}
            data["is_featured"] = bool(data.get("is_featured", False))
            data["is_recommended"] = bool(data.get("is_recommended", False))
            data["sort_priority"] = int(data.get("sort_priority") or 0)
        return data

    def _serialize_model(self, instance: Any) -> dict[str, Any]:
        return self._serialize(instance)

    def _dedupe_list(self, values) -> list[str]:
        ordered: list[str] = []
        seen: set[str] = set()
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            ordered.append(value)
        return ordered

    def _coerce_uuid(self, value: Any) -> UUID | None:
        if isinstance(value, UUID):
            return value
        if isinstance(value, str):
            try:
                return UUID(value)
            except ValueError:
                return None
        return None
