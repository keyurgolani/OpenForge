"""Run domain service."""

from uuid import UUID

from openforge.db.models import RunModel
from openforge.domains.common.crud import CrudDomainService


class RunService(CrudDomainService):
    """Service for managing runs."""

    model = RunModel

    async def list_runs(self, skip: int = 0, limit: int = 100, workspace_id: UUID | None = None):
        return await self.list_records(skip=skip, limit=limit, filters={"workspace_id": workspace_id})

    async def get_run(self, run_id: UUID):
        return await self.get_record(run_id)

    async def create_run(self, run_data: dict):
        return await self.create_record(run_data)

    async def update_run(self, run_id: UUID, run_data: dict):
        return await self.update_record(run_id, run_data)

    async def delete_run(self, run_id: UUID):
        return await self.delete_record(run_id)
