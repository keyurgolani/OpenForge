"""Trigger domain service."""

from uuid import UUID

from openforge.db.models import TriggerDefinitionModel
from openforge.domains.common.crud import CrudDomainService


class TriggerService(CrudDomainService):
    """Service for managing trigger definitions."""

    model = TriggerDefinitionModel

    async def list_triggers(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_trigger(self, trigger_id: UUID):
        return await self.get_record(trigger_id)

    async def create_trigger(self, trigger_data: dict):
        return await self.create_record(trigger_data)

    async def update_trigger(self, trigger_id: UUID, trigger_data: dict):
        return await self.update_record(trigger_id, trigger_data)

    async def delete_trigger(self, trigger_id: UUID):
        return await self.delete_record(trigger_id)
