"""Runtime checkpoint persistence."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select

from openforge.db.models import CheckpointModel


class CheckpointStore:
    """Store for workflow execution checkpoints."""

    def __init__(self, db):
        self.db = db

    async def create_checkpoint(
        self,
        run_id: UUID,
        state: dict[str, Any],
        *,
        step_id: UUID | None = None,
        checkpoint_type: str = "after_step",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        checkpoint = CheckpointModel(
            run_id=run_id,
            step_id=step_id,
            checkpoint_type=checkpoint_type,
            state_snapshot=state,
            metadata_json=metadata or {},
        )
        self.db.add(checkpoint)
        await self.db.flush()
        return self._serialize(checkpoint)

    async def get_checkpoint(self, checkpoint_id: UUID) -> dict[str, Any] | None:
        checkpoint = await self.db.get(CheckpointModel, checkpoint_id)
        return self._serialize(checkpoint) if checkpoint else None

    async def list_checkpoints(self, run_id: UUID) -> list[dict[str, Any]]:
        query = select(CheckpointModel).where(CheckpointModel.run_id == run_id).order_by(CheckpointModel.created_at.asc())
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize(row) for row in rows]

    def _serialize(self, checkpoint: CheckpointModel) -> dict[str, Any]:
        return {
            "id": checkpoint.id,
            "run_id": checkpoint.run_id,
            "step_id": checkpoint.step_id,
            "checkpoint_type": checkpoint.checkpoint_type,
            "state_snapshot": checkpoint.state_snapshot or {},
            "metadata": checkpoint.metadata_json or {},
            "created_at": checkpoint.created_at,
        }
