"""Memory Policy domain service."""

from openforge.domains.common.crud import CrudDomainService
from openforge.db.models import MemoryPolicyModel


class MemoryPolicyService(CrudDomainService):
    """Service for managing memory policies."""

    model = MemoryPolicyModel

    async def list_policies(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_policy(self, policy_id):
        return await self.get_record(policy_id)

    async def create_policy(self, policy_data: dict):
        return await self.create_record(policy_data)

    async def update_policy(self, policy_id, policy_data: dict):
        return await self.update_record(policy_id, policy_data)

    async def delete_policy(self, policy_id):
        return await self.delete_record(policy_id)
