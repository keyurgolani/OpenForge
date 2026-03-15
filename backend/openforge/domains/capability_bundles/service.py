"""Capability Bundle domain service."""

from openforge.domains.common.crud import CrudDomainService
from openforge.db.models import CapabilityBundleModel


class CapabilityBundleService(CrudDomainService):
    """Service for managing capability bundles."""

    model = CapabilityBundleModel

    async def list_bundles(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_bundle(self, bundle_id):
        return await self.get_record(bundle_id)

    async def create_bundle(self, bundle_data: dict):
        return await self.create_record(bundle_data)

    async def update_bundle(self, bundle_id, bundle_data: dict):
        return await self.update_record(bundle_id, bundle_data)

    async def delete_bundle(self, bundle_id):
        return await self.delete_record(bundle_id)
