"""Trigger domain service."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import TriggerDefinitionModel, TriggerFireHistoryModel
from openforge.domains.common.crud import CrudDomainService
from openforge.domains.common.enums import TriggerType

logger = logging.getLogger("openforge.triggers.service")


class TriggerService(CrudDomainService):
    """Service for managing trigger definitions."""

    model = TriggerDefinitionModel

    async def list_triggers(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id: Optional[UUID] = None,
        target_type: Optional[str] = None,
        target_id: Optional[UUID] = None,
        trigger_type: Optional[str] = None,
        is_enabled: Optional[bool] = None,
    ):
        filters: dict[str, Any] = {}
        if workspace_id is not None:
            filters["workspace_id"] = workspace_id
        if target_type is not None:
            filters["target_type"] = target_type
        if target_id is not None:
            filters["target_id"] = target_id
        if trigger_type is not None:
            filters["trigger_type"] = trigger_type
        if is_enabled is not None:
            filters["is_enabled"] = is_enabled
        return await self.list_records(skip=skip, limit=limit, filters=filters)

    async def list_triggers_by_target(
        self,
        target_type: str,
        target_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ):
        filters = {"target_type": target_type, "target_id": target_id}
        return await self.list_records(skip=skip, limit=limit, filters=filters)

    async def get_trigger(self, trigger_id: UUID):
        return await self.get_record(trigger_id)

    async def create_trigger(self, trigger_data: dict):
        return await self.create_record(trigger_data)

    async def update_trigger(self, trigger_id: UUID, trigger_data: dict):
        return await self.update_record(trigger_id, trigger_data)

    async def delete_trigger(self, trigger_id: UUID):
        return await self.delete_record(trigger_id)

    async def enable_trigger(self, trigger_id: UUID) -> dict[str, Any] | None:
        return await self.update_record(trigger_id, {"is_enabled": True})

    async def disable_trigger(self, trigger_id: UUID) -> dict[str, Any] | None:
        return await self.update_record(trigger_id, {"is_enabled": False})

    async def get_trigger_fire_history(
        self,
        trigger_id: UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = (
            select(TriggerFireHistoryModel)
            .where(TriggerFireHistoryModel.trigger_id == trigger_id)
            .order_by(TriggerFireHistoryModel.fired_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        rows = result.scalars().all()
        return [_serialize_fire_record(row) for row in rows]

    async def record_fire(
        self,
        trigger_id: UUID,
        launch_status: str = "pending",
        mission_id: Optional[UUID] = None,
        run_id: Optional[UUID] = None,
        error_message: Optional[str] = None,
        payload_snapshot: Optional[dict] = None,
    ) -> dict[str, Any]:
        record = TriggerFireHistoryModel(
            trigger_id=trigger_id,
            mission_id=mission_id,
            run_id=run_id,
            fired_at=datetime.now(timezone.utc),
            launch_status=launch_status,
            error_message=error_message,
            payload_snapshot=payload_snapshot,
        )
        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)
        return _serialize_fire_record(record)

    @staticmethod
    def compute_next_fire_at(
        trigger_type: str,
        schedule_expression: Optional[str] = None,
        interval_seconds: Optional[int] = None,
        last_fired_at: Optional[datetime] = None,
    ) -> Optional[datetime]:
        """Compute next fire time for cron/interval/heartbeat triggers."""
        now = datetime.now(timezone.utc)

        if trigger_type == TriggerType.CRON and schedule_expression:
            try:
                cron = croniter(schedule_expression, now)
                return cron.get_next(datetime)
            except (ValueError, KeyError):
                logger.warning("Invalid cron expression: %s", schedule_expression)
                return None

        if trigger_type in (TriggerType.INTERVAL, TriggerType.HEARTBEAT) and interval_seconds:
            base = last_fired_at if last_fired_at else now
            return base + timedelta(seconds=interval_seconds)

        return None


def _serialize_fire_record(record: TriggerFireHistoryModel) -> dict[str, Any]:
    return {
        "id": record.id,
        "trigger_id": record.trigger_id,
        "mission_id": record.mission_id,
        "run_id": record.run_id,
        "fired_at": record.fired_at,
        "launch_status": record.launch_status,
        "error_message": record.error_message,
        "payload_snapshot": record.payload_snapshot,
    }
