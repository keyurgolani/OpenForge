"""Deployment scheduler — polls for due deployments and fires runs.

Runs as a Celery Beat periodic task every 30 seconds.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentDefinitionVersionModel,
    DeploymentModel,
    RunModel,
    TriggerDefinitionModel,
)
from openforge.runtime.template_engine import render

logger = logging.getLogger("openforge.deployment_scheduler")


async def poll_and_fire(db: AsyncSession) -> int:
    """Find due deployments and create runs for them. Returns count of runs created."""
    now = datetime.now(timezone.utc)

    query = (
        select(DeploymentModel, TriggerDefinitionModel)
        .join(TriggerDefinitionModel, DeploymentModel.trigger_id == TriggerDefinitionModel.id)
        .where(
            DeploymentModel.status == "active",
            TriggerDefinitionModel.is_enabled.is_(True),
            TriggerDefinitionModel.next_fire_at <= now,
        )
    )

    result = await db.execute(query)
    rows = result.all()
    fired = 0

    for deployment, trigger in rows:
        try:
            # Load pinned agent spec
            spec_row = await db.get(AgentDefinitionVersionModel, deployment.agent_spec_id)
            if not spec_row:
                logger.warning("Deployment %s has no valid agent spec", deployment.id)
                continue

            resolved = spec_row.snapshot or {}
            template = resolved.get("system_prompt", "")
            is_parameterized = bool(resolved.get("parameters"))

            # Render template
            rendered_prompt = template
            if is_parameterized and template:
                render_result = render(template, deployment.input_values or {})
                rendered_prompt = render_result.output

            # Create run
            run = RunModel(
                run_type="automation",
                workspace_id=deployment.workspace_id,
                deployment_id=deployment.id,
                input_payload={
                    "input_values": deployment.input_values,
                    "rendered_system_prompt": rendered_prompt,
                    "instruction": rendered_prompt,
                },
                composite_metadata={
                    "automation_id": str(deployment.automation_id),
                    "deployment_id": str(deployment.id),
                    "agent_spec_id": str(deployment.agent_spec_id),
                },
                status="pending",
            )
            db.add(run)
            await db.flush()

            # Queue Celery task
            from openforge.worker.tasks import execute_agent_strategy
            execute_agent_strategy.delay(run_id=str(run.id))

            # Update trigger timing
            _compute_next_fire(trigger)
            trigger.last_fired_at = now

            # Update deployment
            deployment.last_run_at = now
            deployment.last_run_id = run.id

            fired += 1
            logger.info("Fired deployment %s, run %s", deployment.id, run.id)

        except Exception as exc:
            logger.error("Failed to fire deployment %s: %s", deployment.id, exc)

    if fired:
        await db.commit()

    return fired


def _compute_next_fire(trigger: TriggerDefinitionModel) -> None:
    """Compute the next fire time for a trigger."""
    now = datetime.now(timezone.utc)

    if trigger.interval_seconds:
        trigger.next_fire_at = now + timedelta(seconds=trigger.interval_seconds)
    elif trigger.schedule_expression:
        try:
            from croniter import croniter
            cron = croniter(trigger.schedule_expression, now)
            trigger.next_fire_at = cron.get_next(datetime)
        except Exception:
            logger.warning(
                "Invalid cron expression for trigger %s: %s",
                trigger.id, trigger.schedule_expression,
            )
