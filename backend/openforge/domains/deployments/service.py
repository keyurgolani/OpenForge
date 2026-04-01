"""Deployment service — manages the deploy/pause/resume/teardown lifecycle."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentModel,
    AutomationModel,
    AutomationNodeModel,
    AgentDefinitionVersionModel,
    CompiledAutomationSpecModel,
    DeploymentModel,
    RunModel,
    TriggerDefinitionModel,
)
from openforge.runtime.template_engine import render

logger = logging.getLogger("openforge.deployments")


class DeploymentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def deploy(
        self,
        automation_id: UUID,
        workspace_id: UUID,
        input_values: dict[str, Any],
        deployed_by: str | None = None,
        schedule_expression: str | None = None,
        interval_seconds: int | None = None,
    ) -> dict:
        """Deploy an automation with baked-in input values."""
        automation = await self.db.get(AutomationModel, automation_id)
        if not automation:
            raise ValueError(f"Automation {automation_id} not found")

        # Resolve specs: prefer automation-level deployment schema, fall back to agent spec
        automation_spec_id = automation.active_spec_id
        agent_spec_id = None
        input_schema: list[dict] = []

        if automation_spec_id:
            auto_spec = await self.db.get(CompiledAutomationSpecModel, automation_spec_id)
            if auto_spec:
                resolved = auto_spec.resolved_config or {}
                input_schema = resolved.get("deployment_input_schema", [])
                agent_spec_id = auto_spec.agent_spec_id

        if not automation_spec_id:
            raise ValueError("Automation has no compiled spec")

        # Validate required fields and apply defaults.
        # Schema entries may use composite keys (node_key.input_key) for multi-node
        # automations, or simple names for single-agent automations.
        for param in input_schema:
            # Build the lookup key matching what the frontend sends
            node_key = param.get("node_key")
            input_key = param.get("input_key") or param.get("name", "")
            if node_key:
                lookup_key = f"{node_key}.{input_key}"
            else:
                lookup_key = input_key

            if lookup_key not in input_values:
                if param.get("default") is not None:
                    input_values[lookup_key] = param["default"]
                elif param.get("required", True):
                    label = param.get("label", lookup_key)
                    raise ValueError(f"Required parameter '{label}' not provided")

        # Create per-deployment trigger from schedule_expression or interval_seconds
        trigger_id = None
        trigger_type = "manual"
        effective_cron = schedule_expression if schedule_expression else None
        effective_interval = interval_seconds

        if effective_cron:
            trigger_type = "cron"
        elif effective_interval and effective_interval > 0:
            trigger_type = "interval"

        if trigger_type != "manual":
            # Compute initial next_fire_at from schedule or interval
            next_fire: datetime | None = None
            if effective_cron:
                try:
                    from croniter import croniter
                    cron = croniter(effective_cron, datetime.now(timezone.utc))
                    next_fire = cron.get_next(datetime)
                except Exception:
                    logger.warning("Invalid cron expression: %s", effective_cron)
            elif effective_interval:
                next_fire = datetime.now(timezone.utc) + timedelta(seconds=effective_interval)

            trigger = TriggerDefinitionModel(
                name=f"{automation.slug}__deploy_trigger",
                trigger_type="schedule" if trigger_type == "cron" else trigger_type,
                target_type="deployment",
                target_id=automation_id,
                schedule_expression=effective_cron,
                interval_seconds=effective_interval,
                is_enabled=True,
                status="active",
                next_fire_at=next_fire,
            )
            self.db.add(trigger)
            await self.db.flush()
            trigger_id = trigger.id

        deployment = DeploymentModel(
            automation_id=automation_id,
            workspace_id=workspace_id,
            agent_spec_id=agent_spec_id,
            automation_spec_id=automation_spec_id,
            deployed_by=deployed_by,
            input_values=input_values,
            status="active",
            trigger_id=trigger_id,
        )
        self.db.add(deployment)
        await self.db.flush()

        # Update trigger target_id to point to deployment
        if trigger_id:
            trigger.target_id = deployment.id
            await self.db.flush()

        await self.db.commit()
        return await self._serialize_full(deployment)

    async def pause(self, deployment_id: UUID) -> dict:
        deployment = await self._get(deployment_id)
        deployment.status = "paused"
        if deployment.trigger_id:
            trigger = await self.db.get(TriggerDefinitionModel, deployment.trigger_id)
            if trigger:
                trigger.is_enabled = False
        await self.db.commit()
        return await self._serialize_full(deployment)

    async def resume(self, deployment_id: UUID) -> dict:
        deployment = await self._get(deployment_id)
        deployment.status = "active"
        if deployment.trigger_id:
            trigger = await self.db.get(TriggerDefinitionModel, deployment.trigger_id)
            if trigger:
                trigger.is_enabled = True
        await self.db.commit()
        return await self._serialize_full(deployment)

    async def teardown(self, deployment_id: UUID) -> dict:
        deployment = await self._get(deployment_id)
        deployment.status = "torn_down"
        deployment.torn_down_at = datetime.now(timezone.utc)
        if deployment.trigger_id:
            trigger = await self.db.get(TriggerDefinitionModel, deployment.trigger_id)
            if trigger:
                trigger.is_enabled = False
                trigger.status = "disabled"
        await self.db.commit()
        return await self._serialize_full(deployment)

    async def run_now(self, deployment_id: UUID) -> dict:
        """Trigger an immediate run for an active deployment."""
        deployment = await self._get(deployment_id)
        if deployment.status != "active":
            raise ValueError(f"Cannot run deployment with status '{deployment.status}'")

        # Detect multi-node automation
        node_count = await self.db.scalar(
            select(func.count()).select_from(AutomationNodeModel)
            .where(AutomationNodeModel.automation_id == deployment.automation_id)
        )
        is_multi_node = bool(node_count and node_count > 0)

        rendered_prompt = ""
        composite_metadata: dict[str, Any] = {
            "automation_id": str(deployment.automation_id),
            "deployment_id": str(deployment.id),
        }

        if is_multi_node and deployment.automation_spec_id:
            # Multi-node: use the automation spec; rendering happens per-node in GraphExecutor
            composite_metadata["is_multi_node"] = True
            composite_metadata["automation_spec_id"] = str(deployment.automation_spec_id)
            if deployment.agent_spec_id:
                composite_metadata["agent_spec_id"] = str(deployment.agent_spec_id)
        else:
            # Single-agent: load the pinned agent spec and render the template
            spec_row = (
                await self.db.get(AgentDefinitionVersionModel, deployment.agent_spec_id)
                if deployment.agent_spec_id else None
            )
            if not spec_row:
                raise ValueError("Deployment has no valid agent spec")

            composite_metadata["agent_spec_id"] = str(deployment.agent_spec_id)
            resolved = spec_row.snapshot or {}
            template = resolved.get("system_prompt", "")
            is_parameterized = bool(resolved.get("parameters"))

            rendered_prompt = template
            if is_parameterized and template:
                render_result = render(template, deployment.input_values or {})
                rendered_prompt = render_result.output

        # Create run
        now = datetime.now(timezone.utc)
        run = RunModel(
            run_type="automation",
            workspace_id=deployment.workspace_id,
            deployment_id=deployment.id,
            input_payload={
                "input_values": deployment.input_values or {},
                "rendered_system_prompt": rendered_prompt,
                "instruction": rendered_prompt,
            },
            composite_metadata=composite_metadata,
            status="pending",
        )
        self.db.add(run)
        await self.db.flush()

        # Queue Celery task
        from openforge.worker.tasks import execute_agent_strategy
        execute_agent_strategy.delay(run_id=str(run.id))

        # Update deployment
        deployment.last_run_at = now
        deployment.last_run_id = run.id
        await self.db.commit()

        return {
            "run_id": run.id,
            "deployment_id": deployment.id,
            "status": run.status,
        }

    async def get_deployment(self, deployment_id: UUID) -> dict | None:
        query = (
            select(
                DeploymentModel,
                AutomationModel.name,
                TriggerDefinitionModel.schedule_expression,
                TriggerDefinitionModel.trigger_type,
                TriggerDefinitionModel.interval_seconds,
            )
            .outerjoin(AutomationModel, DeploymentModel.automation_id == AutomationModel.id)
            .outerjoin(TriggerDefinitionModel, DeploymentModel.trigger_id == TriggerDefinitionModel.id)
            .where(DeploymentModel.id == deployment_id)
        )
        row = (await self.db.execute(query)).first()
        if not row:
            return None
        return self._serialize(row[0], automation_name=row[1], schedule_expression=row[2], trigger_type=row[3], interval_seconds=row[4])

    async def list_deployments(
        self,
        skip: int = 0,
        limit: int = 50,
        status: str | None = None,
        automation_id: UUID | None = None,
        workspace_id: UUID | None = None,
    ) -> tuple[list[dict], int]:
        query = (
            select(
                DeploymentModel,
                AutomationModel.name,
                TriggerDefinitionModel.schedule_expression,
                TriggerDefinitionModel.trigger_type,
                TriggerDefinitionModel.interval_seconds,
            )
            .outerjoin(AutomationModel, DeploymentModel.automation_id == AutomationModel.id)
            .outerjoin(TriggerDefinitionModel, DeploymentModel.trigger_id == TriggerDefinitionModel.id)
        )
        count_query = select(func.count()).select_from(DeploymentModel)

        if status:
            query = query.where(DeploymentModel.status == status)
            count_query = count_query.where(DeploymentModel.status == status)
        if automation_id:
            query = query.where(DeploymentModel.automation_id == automation_id)
            count_query = count_query.where(DeploymentModel.automation_id == automation_id)
        if workspace_id:
            query = query.where(DeploymentModel.workspace_id == workspace_id)
            count_query = count_query.where(DeploymentModel.workspace_id == workspace_id)

        query = query.order_by(DeploymentModel.created_at.desc()).offset(skip).limit(limit)
        total = await self.db.scalar(count_query) or 0
        result = await self.db.execute(query)
        rows = result.all()
        return [self._serialize(row[0], automation_name=row[1], schedule_expression=row[2], trigger_type=row[3], interval_seconds=row[4]) for row in rows], total

    async def _serialize_full(self, deployment: DeploymentModel) -> dict:
        """Serialize with automation name and schedule looked up from related models."""
        automation = await self.db.get(AutomationModel, deployment.automation_id)
        automation_name = automation.name if automation else None
        schedule_expr = None
        trig_type = None
        trig_interval = None
        if deployment.trigger_id:
            trigger = await self.db.get(TriggerDefinitionModel, deployment.trigger_id)
            if trigger:
                schedule_expr = trigger.schedule_expression
                trig_type = trigger.trigger_type
                trig_interval = trigger.interval_seconds
        return self._serialize(deployment, automation_name=automation_name, schedule_expression=schedule_expr, trigger_type=trig_type, interval_seconds=trig_interval)

    async def _get(self, deployment_id: UUID) -> DeploymentModel:
        deployment = await self.db.get(DeploymentModel, deployment_id)
        if not deployment:
            raise ValueError(f"Deployment {deployment_id} not found")
        return deployment

    def _serialize(
        self,
        deployment: DeploymentModel,
        automation_name: str | None = None,
        schedule_expression: str | None = None,
        trigger_type: str | None = None,
        interval_seconds: int | None = None,
    ) -> dict:
        # Normalize trigger_type for the frontend: "schedule" -> "cron"
        normalized_trigger_type = trigger_type
        if trigger_type == "schedule":
            normalized_trigger_type = "cron"
        elif trigger_type is None and deployment.trigger_id is None:
            normalized_trigger_type = "manual"

        return {
            "id": deployment.id,
            "automation_id": deployment.automation_id,
            "automation_name": automation_name,
            "workspace_id": deployment.workspace_id,
            "agent_spec_id": deployment.agent_spec_id,
            "deployed_by": deployment.deployed_by,
            "input_values": deployment.input_values or {},
            "status": deployment.status,
            "trigger_id": deployment.trigger_id,
            "trigger_type": normalized_trigger_type,
            "schedule_expression": schedule_expression,
            "interval_seconds": interval_seconds,
            "last_run_id": deployment.last_run_id,
            "last_run_at": deployment.last_run_at,
            "last_success_at": deployment.last_success_at,
            "last_failure_at": deployment.last_failure_at,
            "created_at": deployment.created_at,
            "updated_at": deployment.updated_at,
            "torn_down_at": deployment.torn_down_at,
        }
