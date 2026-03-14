"""Mission domain service."""

from uuid import UUID

from openforge.db.models import MissionDefinitionModel
from openforge.domains.common.crud import CrudDomainService


class MissionService(CrudDomainService):
    """Service for managing mission definitions."""

    model = MissionDefinitionModel

    async def list_missions(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_mission(self, mission_id: UUID):
        return await self.get_record(mission_id)

    async def create_mission(self, mission_data: dict):
        return await self.create_record(mission_data)

    async def update_mission(self, mission_id: UUID, mission_data: dict):
        return await self.update_record(mission_id, mission_data)

    async def delete_mission(self, mission_id: UUID):
        return await self.delete_record(mission_id)
