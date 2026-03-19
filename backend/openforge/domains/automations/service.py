"""Automation domain service."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from openforge.db.models import AgentModel, AutomationModel, CompiledAutomationSpecModel
from openforge.domains.common.crud import CrudDomainService

from .blueprint import AutomationBlueprint
from .compiler import AutomationBlueprintCompiler

logger = logging.getLogger("openforge.automations.service")


class AutomationService(CrudDomainService):
    """Service for managing automations and triggering compilation."""

    model = AutomationModel

    async def list_automations(
        self,
        skip: int = 0,
        limit: int = 100,
        status: str | None = None,
        agent_id: UUID | None = None,
        is_template: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(AutomationModel).order_by(AutomationModel.updated_at.desc())
        count_query = select(func.count()).select_from(AutomationModel)

        if status is not None:
            query = query.where(AutomationModel.status == status)
            count_query = count_query.where(AutomationModel.status == status)
        if agent_id is not None:
            query = query.where(AutomationModel.agent_id == agent_id)
            count_query = count_query.where(AutomationModel.agent_id == agent_id)
        if is_template is not None:
            query = query.where(AutomationModel.is_template == is_template)
            count_query = count_query.where(AutomationModel.is_template == is_template)

        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

    async def get_automation(self, automation_id: UUID) -> dict[str, Any] | None:
        return await self.get_record(automation_id)

    async def create_automation(self, data: dict[str, Any]) -> dict[str, Any]:
        result = await self.create_record(data)

        # Auto-compile
        try:
            automation = await self.db.get(AutomationModel, result["id"])
            agent = await self.db.get(AgentModel, automation.agent_id)
            if agent is None:
                raise ValueError(f"Agent {automation.agent_id} not found")

            blueprint = AutomationBlueprint(
                name=automation.name,
                slug=automation.slug,
                description=automation.description,
                agent_slug=agent.slug,
                trigger=automation.trigger_config or {},
                budget=automation.budget_config or {},
                output=automation.output_config or {},
                tags=automation.tags or [],
                icon=automation.icon,
            )
            compiler = AutomationBlueprintCompiler(self.db)
            await compiler.compile(automation, blueprint, agent)
            await self.db.refresh(automation)
            result = self._serialize(automation)
        except Exception as e:
            logger.warning("Auto-compilation failed for automation %s: %s", result.get("slug"), e)

        return result

    async def update_automation(self, automation_id: UUID, data: dict[str, Any]) -> dict[str, Any] | None:
        result = await self.update_record(automation_id, data)
        if result is None:
            return None

        # Auto-recompile if trigger/budget/output config changed
        recompile_keys = {"trigger_config", "budget_config", "output_config", "agent_id"}
        if recompile_keys & set(data.keys()):
            try:
                automation = await self.db.get(AutomationModel, automation_id)
                agent = await self.db.get(AgentModel, automation.agent_id)
                if agent is None:
                    raise ValueError(f"Agent {automation.agent_id} not found")

                blueprint = AutomationBlueprint(
                    name=automation.name,
                    slug=automation.slug,
                    description=automation.description,
                    agent_slug=agent.slug,
                    trigger=automation.trigger_config or {},
                    budget=automation.budget_config or {},
                    output=automation.output_config or {},
                    tags=automation.tags or [],
                    icon=automation.icon,
                )
                compiler = AutomationBlueprintCompiler(self.db)
                await compiler.compile(automation, blueprint, agent)
                await self.db.refresh(automation)
                result = self._serialize(automation)
            except Exception as e:
                logger.warning("Auto-recompilation failed for automation %s: %s", automation_id, e)

        return result

    async def delete_automation(self, automation_id: UUID) -> bool:
        return await self.delete_record(automation_id)

    async def compile_automation(self, automation_id: UUID) -> dict[str, Any] | None:
        """Force recompilation of an automation."""
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None

        agent = await self.db.get(AgentModel, automation.agent_id)
        if agent is None:
            return {
                "automation_id": automation.id,
                "compilation_status": "failed",
                "compilation_error": f"Agent {automation.agent_id} not found",
            }

        blueprint = AutomationBlueprint(
            name=automation.name,
            slug=automation.slug,
            description=automation.description,
            agent_slug=agent.slug,
            trigger=automation.trigger_config or {},
            budget=automation.budget_config or {},
            output=automation.output_config or {},
            tags=automation.tags or [],
            icon=automation.icon,
        )
        compiler = AutomationBlueprintCompiler(self.db)
        await compiler.compile(automation, blueprint, agent)
        await self.db.refresh(automation)

        return {
            "automation_id": automation.id,
            "spec_id": automation.active_spec_id,
            "version": await self._latest_version(automation.id),
            "compilation_status": automation.compilation_status,
            "compilation_error": automation.compilation_error,
        }

    async def set_status(self, automation_id: UUID, new_status: str) -> dict[str, Any] | None:
        """Update automation status (pause/resume/activate)."""
        return await self.update_record(automation_id, {"status": new_status})

    async def get_health(self, automation_id: UUID) -> dict[str, Any] | None:
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None
        return {
            "automation_id": automation.id,
            "health_status": automation.health_status,
            "last_run_at": automation.last_run_at,
            "last_success_at": automation.last_success_at,
            "last_failure_at": automation.last_failure_at,
            "last_error_summary": automation.last_error_summary,
            "compilation_status": automation.compilation_status,
        }

    async def get_active_spec(self, automation_id: UUID) -> dict[str, Any] | None:
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None or automation.active_spec_id is None:
            return None
        spec = await self.db.get(CompiledAutomationSpecModel, automation.active_spec_id)
        if spec is None:
            return None
        return self._serialize(spec)

    async def list_templates(
        self, skip: int = 0, limit: int = 100
    ) -> tuple[list[dict[str, Any]], int]:
        return await self.list_automations(skip=skip, limit=limit, is_template=True)

    async def _latest_version(self, automation_id: UUID) -> int:
        result = await self.db.scalar(
            select(func.max(CompiledAutomationSpecModel.version))
            .where(CompiledAutomationSpecModel.automation_id == automation_id)
        )
        return result or 0

    def _serialize(self, instance: Any) -> dict[str, Any]:
        data = super()._serialize(instance)
        if isinstance(instance, AutomationModel):
            data["tags"] = data.get("tags") or []
            data["trigger_config"] = data.get("trigger_config") or {}
            data["budget_config"] = data.get("budget_config") or {}
            data["output_config"] = data.get("output_config") or {}
        return data
