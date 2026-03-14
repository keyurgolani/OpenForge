"""Artifact domain service."""

from uuid import UUID

from openforge.db.models import ArtifactModel
from openforge.domains.common.crud import CrudDomainService


class ArtifactService(CrudDomainService):
    """Service for managing artifacts."""

    model = ArtifactModel
    field_aliases = {"metadata": "metadata_json"}

    async def list_artifacts(self, skip: int = 0, limit: int = 100, workspace_id: UUID | None = None):
        return await self.list_records(skip=skip, limit=limit, filters={"workspace_id": workspace_id})

    async def get_artifact(self, artifact_id: UUID):
        return await self.get_record(artifact_id)

    async def create_artifact(self, artifact_data: dict):
        return await self.create_record(artifact_data)

    async def update_artifact(self, artifact_id: UUID, artifact_data: dict):
        return await self.update_record(artifact_id, artifact_data)

    async def delete_artifact(self, artifact_id: UUID):
        return await self.delete_record(artifact_id)
