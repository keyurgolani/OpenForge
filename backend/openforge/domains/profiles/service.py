"""Profile domain service."""

from uuid import UUID

from openforge.db.models import AgentProfileModel
from openforge.domains.common.crud import CrudDomainService


class ProfileService(CrudDomainService):
    """Service for managing agent profiles."""

    model = AgentProfileModel

    async def list_profiles(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_profile(self, profile_id: UUID):
        return await self.get_record(profile_id)

    async def create_profile(self, profile_data: dict):
        return await self.create_record(profile_data)

    async def update_profile(self, profile_id: UUID, profile_data: dict):
        return await self.update_record(profile_id, profile_data)

    async def delete_profile(self, profile_id: UUID):
        return await self.delete_record(profile_id)
