"""
Event-driven trigger dispatch.

Matches domain events to event-type triggers and launches the
corresponding missions or workflows.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import TriggerDefinitionModel
from openforge.domains.common.enums import TriggerType
from openforge.domains.triggers.service import TriggerService

logger = logging.getLogger("openforge.triggers.event_dispatch")

# Supported event types (seed list)
SUPPORTED_EVENT_TYPES = frozenset(
    {
        "document_imported",
        "artifact_created",
        "artifact_updated",
        "approval_resolved",
        "graph_extraction_completed",
        "run_completed",
        "run_failed",
    }
)


class TriggerEventDispatcher:
    """Matches domain events to event-type triggers and launches missions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def dispatch_event(
        self,
        event_type: str,
        source_id: UUID,
        payload: Optional[dict[str, Any]] = None,
        workspace_id: Optional[UUID] = None,
    ) -> list[dict[str, Any]]:
        """
        Dispatch a domain event to matching event-type triggers.

        Args:
            event_type: The event type string (e.g. "artifact_created")
            source_id: ID of the entity that emitted the event
            payload: Optional event payload data
            workspace_id: Optional workspace to restrict trigger matching

        Returns:
            List of trigger fire records for each dispatched trigger
        """
        query = (
            select(TriggerDefinitionModel)
            .where(
                TriggerDefinitionModel.is_enabled.is_(True),
                TriggerDefinitionModel.trigger_type == TriggerType.EVENT,
                TriggerDefinitionModel.event_type == event_type,
            )
        )
        if workspace_id is not None:
            query = query.where(TriggerDefinitionModel.workspace_id == workspace_id)
        result = await self.db.execute(query)
        matched_triggers = result.scalars().all()

        if not matched_triggers:
            return []

        fired_records: list[dict[str, Any]] = []
        service = TriggerService(self.db)

        for trigger in matched_triggers:
            fire_record = await self._dispatch_trigger(
                service, trigger, source_id, payload
            )
            fired_records.append(fire_record)

        return fired_records

    async def _dispatch_trigger(
        self,
        service: TriggerService,
        trigger: TriggerDefinitionModel,
        source_id: UUID,
        event_payload: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        """Dispatch a single trigger: prepare payload, launch, record history."""
        from openforge.runtime.launching import LaunchService

        # Merge trigger's payload_template with event payload
        merged_payload = dict(trigger.payload_template or {})
        if event_payload:
            merged_payload.update(event_payload)
        merged_payload["_event_source_id"] = str(source_id)

        launch_service = LaunchService(self.db)
        launch_status = "success"
        error_message = None
        run_id = None

        try:
            launch_result = await launch_service.launch_trigger(
                trigger_id=trigger.id,
                workspace_id=trigger.workspace_id,
                context=merged_payload,
            )
            run_id_raw = launch_result.get("run_id")
            if run_id_raw:
                run_id = UUID(str(run_id_raw)) if not isinstance(run_id_raw, UUID) else run_id_raw
        except Exception as exc:
            launch_status = "error"
            error_message = str(exc)
            logger.warning(
                "Event trigger %s dispatch failed: %s", trigger.id, error_message
            )

        # Record fire
        fire_record = await service.record_fire(
            trigger_id=trigger.id,
            launch_status=launch_status,
            mission_id=trigger.target_id if trigger.target_type == "mission" else None,
            run_id=run_id,
            error_message=error_message,
            payload_snapshot=merged_payload,
        )

        # Update last_fired_at
        trigger.last_fired_at = datetime.now(timezone.utc)
        await self.db.commit()

        logger.info(
            "Event trigger %s (%s) dispatched for event '%s'.",
            trigger.id,
            trigger.name,
            trigger.event_type,
        )

        return fire_record
