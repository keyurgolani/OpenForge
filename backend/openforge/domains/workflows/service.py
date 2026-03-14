"""Workflow domain service."""

from uuid import UUID

from openforge.db.models import WorkflowDefinitionModel
from openforge.domains.common.crud import CrudDomainService


class WorkflowService(CrudDomainService):
    """Service for managing workflow definitions."""

    model = WorkflowDefinitionModel

    async def list_workflows(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_workflow(self, workflow_id: UUID):
        return await self.get_record(workflow_id)

    async def create_workflow(self, workflow_data: dict):
        return await self.create_record(workflow_data)

    async def update_workflow(self, workflow_id: UUID, workflow_data: dict):
        return await self.update_record(workflow_id, workflow_data)

    async def delete_workflow(self, workflow_id: UUID):
        return await self.delete_record(workflow_id)
