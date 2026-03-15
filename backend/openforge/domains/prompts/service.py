"""Prompt domain service."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import PromptDefinitionModel, PromptUsageLogModel, PromptVersionModel

from .rendering import PromptRenderError, render_prompt_version, select_prompt_version
from .seed import SEED_PROMPTS


class PromptService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_prompts(self, skip: int = 0, limit: int = 100) -> tuple[list[dict[str, Any]], int]:
        query = select(PromptDefinitionModel).order_by(PromptDefinitionModel.updated_at.desc())
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        total = await self.db.scalar(select(func.count()).select_from(PromptDefinitionModel))
        return [await self._serialize_prompt(row) for row in rows], int(total or 0)

    async def get_prompt(self, prompt_id: UUID) -> dict[str, Any] | None:
        row = await self.db.get(PromptDefinitionModel, prompt_id)
        if row is None:
            return None
        return await self._serialize_prompt(row)

    async def create_prompt(self, payload: dict[str, Any]) -> dict[str, Any]:
        definition = PromptDefinitionModel(**payload, version=1)
        self.db.add(definition)
        await self.db.flush()
        version = PromptVersionModel(
            prompt_definition_id=definition.id,
            version=1,
            template=definition.template,
            template_format=definition.template_format,
            variable_schema=definition.variable_schema,
            status=definition.status,
            created_by=payload.get("created_by"),
        )
        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(definition)
        return await self._serialize_prompt(definition)

    async def update_prompt(self, prompt_id: UUID, payload: dict[str, Any]) -> dict[str, Any] | None:
        definition = await self.db.get(PromptDefinitionModel, prompt_id)
        if definition is None:
            return None

        template_changed = any(
            key in payload
            for key in ("template", "template_format", "variable_schema")
        )

        if template_changed:
            next_version = int(definition.version or 0) + 1
            if "template" in payload:
                definition.template = payload["template"]
            if "template_format" in payload:
                definition.template_format = payload["template_format"]
            if "variable_schema" in payload:
                definition.variable_schema = payload["variable_schema"]
            definition.version = next_version
            self.db.add(
                PromptVersionModel(
                    prompt_definition_id=definition.id,
                    version=next_version,
                    template=definition.template,
                    template_format=definition.template_format,
                    variable_schema=definition.variable_schema,
                    status=payload.get("status", definition.status),
                    created_by=payload.get("updated_by"),
                )
            )

        for key, value in payload.items():
            if key in {"template", "template_format", "variable_schema"}:
                continue
            setattr(definition, key, value)

        await self.db.commit()
        await self.db.refresh(definition)
        return await self._serialize_prompt(definition)

    async def list_versions(self, prompt_id: UUID) -> list[PromptVersionModel]:
        query = (
            select(PromptVersionModel)
            .where(PromptVersionModel.prompt_definition_id == prompt_id)
            .order_by(PromptVersionModel.version.desc())
        )
        return list((await self.db.execute(query)).scalars().all())

    async def preview_prompt(self, prompt_id: UUID, version: int | None = None, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        rendered = await self.render_prompt(prompt_id, version=version, variables=variables or {}, context="preview")
        return {
            "content": rendered.content,
            "metadata": rendered.metadata.model_dump(),
            "validation_errors": [],
        }

    async def render_prompt(self, prompt_lookup: UUID | str, *, version: int | None = None, variables: dict[str, Any], context: str) -> Any:
        definition = await self._resolve_definition(prompt_lookup)
        if definition is None:
            raise PromptRenderError("prompt_not_found", f"Managed prompt '{prompt_lookup}' was not found.")

        versions = await self.list_versions(definition.id)
        selected_version = select_prompt_version(versions, requested_version=version)
        try:
            rendered = render_prompt_version(definition, selected_version, variables)
        except PromptRenderError as exc:
            await self._record_usage(definition, selected_version, variables, context=context, success=False, error_code=exc.reason_code)
            raise

        await self._record_usage(definition, selected_version, variables, context=context, success=True, error_code=None)
        return rendered

    async def _resolve_definition(self, prompt_lookup: UUID | str) -> PromptDefinitionModel | None:
        if isinstance(prompt_lookup, UUID):
            return await self.db.get(PromptDefinitionModel, prompt_lookup)

        clause = PromptDefinitionModel.slug == str(prompt_lookup)
        try:
            clause = or_(PromptDefinitionModel.slug == str(prompt_lookup), PromptDefinitionModel.id == UUID(str(prompt_lookup)))
        except ValueError:
            pass
        return (await self.db.execute(select(PromptDefinitionModel).where(clause))).scalar_one_or_none()

    async def _record_usage(
        self,
        definition: PromptDefinitionModel,
        version: PromptVersionModel,
        variables: dict[str, Any],
        *,
        context: str,
        success: bool,
        error_code: str | None,
    ) -> None:
        self.db.add(
            PromptUsageLogModel(
                prompt_definition_id=definition.id,
                prompt_version_id=version.id,
                owner_type=definition.owner_type,
                owner_id=definition.owner_id,
                render_context=context,
                variable_keys=sorted(variables.keys()),
                success=success,
                error_code=error_code,
            )
        )
        await self.db.commit()

    async def _serialize_prompt(self, row: PromptDefinitionModel) -> dict[str, Any]:
        last_used_at = await self.db.scalar(
            select(func.max(PromptUsageLogModel.rendered_at)).where(PromptUsageLogModel.prompt_definition_id == row.id)
        )
        return {
            "id": row.id,
            "name": row.name,
            "slug": row.slug,
            "description": row.description,
            "prompt_type": row.prompt_type,
            "template": row.template,
            "template_format": row.template_format,
            "variable_schema": row.variable_schema,
            "fallback_behavior": row.fallback_behavior,
            "owner_type": row.owner_type,
            "owner_id": row.owner_id,
            "is_system": row.is_system,
            "is_template": row.is_template,
            "status": row.status,
            "version": row.version,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "created_by": row.created_by,
            "updated_by": row.updated_by,
            "last_used_at": last_used_at,
        }


async def seed_prompt_catalog(db: AsyncSession) -> None:
    service = PromptService(db)
    for seed_prompt in SEED_PROMPTS:
        existing = await service._resolve_definition(seed_prompt["slug"])
        if existing is None:
            await service.create_prompt(seed_prompt)
            continue

        template_changed = any(
            getattr(existing, key) != seed_prompt[key]
            for key in ("template", "template_format", "variable_schema")
        )
        payload = {
            "name": seed_prompt["name"],
            "description": seed_prompt["description"],
            "prompt_type": seed_prompt["prompt_type"],
            "fallback_behavior": seed_prompt["fallback_behavior"],
            "owner_type": seed_prompt["owner_type"],
            "owner_id": seed_prompt["owner_id"],
            "is_system": seed_prompt["is_system"],
            "is_template": seed_prompt["is_template"],
            "status": seed_prompt["status"],
        }
        if template_changed:
            payload.update(
                {
                    "template": seed_prompt["template"],
                    "template_format": seed_prompt["template_format"],
                    "variable_schema": seed_prompt["variable_schema"],
                }
            )
        await service.update_prompt(existing.id, payload)


async def render_managed_prompt(
    db: AsyncSession,
    prompt_lookup: UUID | str,
    *,
    variables: dict[str, Any],
    version: int | None = None,
    context: str = "runtime",
):
    return await PromptService(db).render_prompt(prompt_lookup, version=version, variables=variables, context=context)


def render_prompt_template(text: str, **variables: Any) -> str:
    return text.format_map(variables)


async def resolve_prompt_text(
    db: AsyncSession,
    prompt_id: UUID | str,
    *,
    default_text: str | None = None,
    version: int | None = None,
    context: str = "runtime",
    **variables: Any,
) -> str:
    try:
        rendered = await render_managed_prompt(
            db,
            prompt_id,
            variables=variables,
            version=version,
            context=context,
        )
        return rendered.content
    except PromptRenderError:
        if default_text is not None:
            return render_prompt_template(default_text, **variables)
        raise


async def resolve_profile_system_prompt(
    db: AsyncSession,
    profile: Any,
    *,
    context: str = "runtime",
    **variables: Any,
) -> str:
    raw_prompt = (getattr(profile, "system_prompt", "") or "").strip()
    if not raw_prompt:
        prompt_ref = (getattr(profile, "system_prompt_ref", "") or "").strip()
        if prompt_ref:
            raw_prompt = prompt_ref if prompt_ref.startswith("catalogue:") else f"catalogue:{prompt_ref}"

    if raw_prompt.startswith("catalogue:"):
        prompt_id = raw_prompt.split(":", 1)[1]
        return await resolve_prompt_text(db, prompt_id, context=context, **variables)

    if not raw_prompt and getattr(profile, "id", "") == "workspace_agent":
        return await resolve_prompt_text(db, "agent_system", context=context, **variables)

    return render_prompt_template(raw_prompt, **variables)
