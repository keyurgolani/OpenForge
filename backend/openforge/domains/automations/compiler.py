"""Automation blueprint compiler.

Resolves an AutomationBlueprint into a CompiledAutomationSpec and persists it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentModel,
    AutomationModel,
    CompiledAgentSpecModel,
    CompiledAutomationSpecModel,
    TriggerDefinitionModel,
)

from .blueprint import AutomationBlueprint
from .compiled_spec import CompiledAutomationSpec

logger = logging.getLogger("openforge.automations.compiler")

COMPILER_VERSION = "1.0.0"


class AutomationBlueprintCompiler:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def compile(
        self,
        automation: AutomationModel,
        blueprint: AutomationBlueprint,
        agent: AgentModel,
    ) -> CompiledAutomationSpec:
        """Compile an automation blueprint into an immutable spec.

        1. Verify agent has active_spec_id
        2. Upsert TriggerDefinitionModel
        3. Build CompiledAutomationSpec
        4. Persist CompiledAutomationSpecModel row
        5. Update automation with active_spec_id
        """
        try:
            # Verify agent is compiled
            if not agent.active_spec_id:
                raise ValueError(f"Agent {agent.slug} has no active compiled spec")

            agent_spec = await self.db.get(CompiledAgentSpecModel, agent.active_spec_id)
            if agent_spec is None:
                raise ValueError(f"Agent spec {agent.active_spec_id} not found")

            # Upsert trigger definition
            trigger = await self._upsert_trigger(automation, blueprint)

            spec = CompiledAutomationSpec(
                automation_id=automation.id,
                automation_slug=automation.slug,
                name=blueprint.name,
                agent_id=agent.id,
                agent_spec_id=agent_spec.id,
                agent_spec_version=agent_spec.version,
                trigger_type=blueprint.trigger.type,
                schedule_expression=blueprint.trigger.schedule,
                interval_seconds=blueprint.trigger.interval_seconds,
                event_type=blueprint.trigger.event_type,
                max_runs_per_day=blueprint.budget.max_runs_per_day,
                max_concurrent_runs=blueprint.budget.max_concurrent_runs,
                max_token_budget_per_day=blueprint.budget.max_token_budget_per_day,
                cooldown_seconds_after_failure=blueprint.budget.cooldown_seconds_after_failure,
                artifact_types=blueprint.output.artifact_types,
                trigger_id=trigger.id if trigger else None,
                compiler_version=COMPILER_VERSION,
            )

            # Determine next version
            next_version = await self._next_version(automation.id)

            # Persist spec
            spec_row = CompiledAutomationSpecModel(
                automation_id=automation.id,
                version=next_version,
                resolved_config=spec.model_dump(mode="json"),
                agent_spec_id=agent_spec.id,
                trigger_id=trigger.id if trigger else None,
                compiler_version=COMPILER_VERSION,
                is_valid=True,
                validation_errors=[],
            )
            self.db.add(spec_row)
            await self.db.flush()

            # Update automation
            automation.active_spec_id = spec_row.id
            automation.compilation_status = "success"
            automation.compilation_error = None
            automation.last_compiled_at = datetime.now(timezone.utc)

            await self.db.commit()
            await self.db.refresh(spec_row)

            logger.info("Compiled automation %s v%d", automation.slug, next_version)
            return spec

        except Exception as e:
            await self.db.rollback()
            automation.compilation_status = "failed"
            automation.compilation_error = str(e)
            self.db.add(automation)
            await self.db.commit()
            logger.error("Failed to compile automation %s: %s", automation.slug, e)
            raise

    async def _upsert_trigger(
        self, automation: AutomationModel, blueprint: AutomationBlueprint
    ) -> TriggerDefinitionModel | None:
        """Create or update trigger definition for this automation."""
        if blueprint.trigger.type == "manual":
            return None

        trigger_name = f"{automation.slug}__trigger"
        trigger = await self.db.scalar(
            select(TriggerDefinitionModel).where(
                TriggerDefinitionModel.name == trigger_name,
                TriggerDefinitionModel.target_id == automation.id,
            )
        )

        if trigger is None:
            trigger = TriggerDefinitionModel(
                workspace_id=None,
                name=trigger_name,
                trigger_type=blueprint.trigger.type,
                target_type="automation",
                target_id=automation.id,
                schedule_expression=blueprint.trigger.schedule,
                interval_seconds=blueprint.trigger.interval_seconds,
                event_type=blueprint.trigger.event_type,
                payload_template=blueprint.trigger.payload_template,
                is_enabled=True,
                status="active",
            )
            self.db.add(trigger)
            await self.db.flush()
        else:
            trigger.trigger_type = blueprint.trigger.type
            trigger.schedule_expression = blueprint.trigger.schedule
            trigger.interval_seconds = blueprint.trigger.interval_seconds
            trigger.event_type = blueprint.trigger.event_type
            trigger.payload_template = blueprint.trigger.payload_template

        return trigger

    async def _next_version(self, automation_id) -> int:
        """Get the next version number for an automation's specs."""
        max_version = await self.db.scalar(
            select(func.max(CompiledAutomationSpecModel.version))
            .where(CompiledAutomationSpecModel.automation_id == automation_id)
        )
        return (max_version or 0) + 1
