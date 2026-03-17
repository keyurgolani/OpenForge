"""Run domain service."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import CheckpointModel, RunModel, RunStepModel, RuntimeEventModel


class RunService:
    """Service for managing runs and runtime inspection views."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _serialize_run(self, instance: RunModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "run_type": instance.run_type,
            "workflow_id": instance.workflow_id,
            "workflow_version_id": getattr(instance, "workflow_version_id", None),
            "mission_id": instance.mission_id,
            "parent_run_id": instance.parent_run_id,
            "root_run_id": getattr(instance, "root_run_id", None),
            "spawned_by_step_id": getattr(instance, "spawned_by_step_id", None),
            "workspace_id": instance.workspace_id,
            "status": instance.status,
            "state_snapshot": instance.state_snapshot or {},
            "input_payload": instance.input_payload or {},
            "output_payload": instance.output_payload or {},
            "current_node_id": getattr(instance, "current_node_id", None),
            "delegation_mode": getattr(instance, "delegation_mode", None),
            "merge_strategy": getattr(instance, "merge_strategy", None),
            "join_group_id": getattr(instance, "join_group_id", None),
            "branch_key": getattr(instance, "branch_key", None),
            "branch_index": getattr(instance, "branch_index", None),
            "handoff_reason": getattr(instance, "handoff_reason", None),
            "composite_metadata": getattr(instance, "composite_metadata", {}) or {},
            "error_code": instance.error_code,
            "error_message": instance.error_message,
            "started_at": instance.started_at,
            "completed_at": instance.completed_at,
            "cancelled_at": getattr(instance, "cancelled_at", None),
            "created_at": getattr(instance, "created_at", None),
            "updated_at": getattr(instance, "updated_at", None),
        }

    def _serialize_step(self, instance: RunStepModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "run_id": instance.run_id,
            "node_id": instance.node_id,
            "node_key": instance.node_key,
            "step_index": instance.step_index,
            "status": instance.status,
            "input_snapshot": instance.input_snapshot or {},
            "output_snapshot": instance.output_snapshot or {},
            "delegation_mode": getattr(instance, "delegation_mode", None),
            "merge_strategy": getattr(instance, "merge_strategy", None),
            "join_group_id": getattr(instance, "join_group_id", None),
            "branch_key": getattr(instance, "branch_key", None),
            "branch_index": getattr(instance, "branch_index", None),
            "handoff_reason": getattr(instance, "handoff_reason", None),
            "composite_metadata": getattr(instance, "composite_metadata", {}) or {},
            "checkpoint_id": instance.checkpoint_id,
            "error_code": instance.error_code,
            "error_message": instance.error_message,
            "retry_count": instance.retry_count,
            "started_at": instance.started_at,
            "completed_at": instance.completed_at,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    def _serialize_checkpoint(self, instance: CheckpointModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "run_id": instance.run_id,
            "step_id": instance.step_id,
            "checkpoint_type": instance.checkpoint_type,
            "state_snapshot": instance.state_snapshot or {},
            "metadata": instance.metadata_json or {},
            "created_at": instance.created_at,
        }

    def _serialize_event(self, instance: RuntimeEventModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "run_id": instance.run_id,
            "step_id": instance.step_id,
            "workflow_id": instance.workflow_id,
            "workflow_version_id": instance.workflow_version_id,
            "node_id": instance.node_id,
            "node_key": instance.node_key,
            "event_type": instance.event_type,
            "payload": instance.payload_json or {},
            "created_at": instance.created_at,
        }

    async def _coordinator(self):
        from openforge.domains.artifacts.service import ArtifactService
        from openforge.domains.policies.approval_service import ApprovalService
        from openforge.domains.workflows.service import WorkflowService
        from openforge.runtime.checkpoint_store import CheckpointStore
        from openforge.runtime.coordinator import RuntimeCoordinator
        from openforge.runtime.event_publisher import EventPublisher

        return RuntimeCoordinator(
            db=self.db,
            workflow_service=WorkflowService(self.db),
            artifact_service=ArtifactService(self.db),
            approval_service=ApprovalService(self.db),
            checkpoint_store=CheckpointStore(self.db),
            event_publisher=EventPublisher(self.db),
        )

    async def list_runs(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id: UUID | None = None,
        status: str | None = None,
        run_type: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(RunModel).order_by(RunModel.created_at.desc())
        count_query = select(func.count()).select_from(RunModel)
        if workspace_id is not None:
            query = query.where(RunModel.workspace_id == workspace_id)
            count_query = count_query.where(RunModel.workspace_id == workspace_id)
        if status is not None:
            query = query.where(RunModel.status == status)
            count_query = count_query.where(RunModel.status == status)
        if run_type is not None:
            query = query.where(RunModel.run_type == run_type)
            count_query = count_query.where(RunModel.run_type == run_type)
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        total = await self.db.scalar(count_query)
        return [self._serialize_run(row) for row in rows], int(total or 0)

    async def get_run(self, run_id: UUID) -> dict[str, Any] | None:
        run = await self.db.get(RunModel, run_id)
        if run is None:
            return None
        return self._serialize_run(run)

    async def create_run(self, run_data: dict[str, Any]) -> dict[str, Any]:
        run = RunModel(
            run_type=getattr(run_data.get("run_type"), "value", run_data.get("run_type", "workflow")),
            workflow_id=run_data.get("workflow_id"),
            workflow_version_id=run_data.get("workflow_version_id"),
            mission_id=run_data.get("mission_id"),
            parent_run_id=run_data.get("parent_run_id"),
            root_run_id=run_data.get("root_run_id"),
            spawned_by_step_id=run_data.get("spawned_by_step_id"),
            workspace_id=run_data["workspace_id"],
            status=getattr(run_data.get("status"), "value", run_data.get("status", "pending")),
            input_payload=run_data.get("input_payload", {}),
            state_snapshot=run_data.get("state_snapshot", {}),
            output_payload=run_data.get("output_payload", {}),
            current_node_id=run_data.get("current_node_id"),
            delegation_mode=run_data.get("delegation_mode"),
            merge_strategy=run_data.get("merge_strategy"),
            join_group_id=run_data.get("join_group_id"),
            branch_key=run_data.get("branch_key"),
            branch_index=run_data.get("branch_index"),
            handoff_reason=run_data.get("handoff_reason"),
            composite_metadata=run_data.get("composite_metadata", {}),
            error_code=run_data.get("error_code"),
            error_message=run_data.get("error_message"),
            started_at=run_data.get("started_at"),
            completed_at=run_data.get("completed_at"),
            cancelled_at=run_data.get("cancelled_at"),
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        return self._serialize_run(run)

    async def update_run(self, run_id: UUID, run_data: dict[str, Any]) -> dict[str, Any] | None:
        run = await self.db.get(RunModel, run_id)
        if run is None:
            return None
        for key, value in run_data.items():
            if value is None:
                continue
            setattr(run, key, getattr(value, "value", value))
        await self.db.commit()
        await self.db.refresh(run)
        return self._serialize_run(run)

    async def delete_run(self, run_id: UUID) -> bool:
        run = await self.db.get(RunModel, run_id)
        if run is None:
            return False
        await self.db.delete(run)
        await self.db.commit()
        return True

    async def list_steps(self, run_id: UUID) -> list[dict[str, Any]]:
        query = select(RunStepModel).where(RunStepModel.run_id == run_id).order_by(RunStepModel.step_index.asc())
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize_step(row) for row in rows]

    async def get_lineage(self, run_id: UUID) -> dict[str, Any]:
        run = await self.db.get(RunModel, run_id)
        if run is None:
            return {"run_id": run_id, "parent_run": None, "child_runs": [], "tree": {}, "delegation_history": [], "branch_groups": []}
        parent_run = await self.db.get(RunModel, run.parent_run_id) if run.parent_run_id else None
        query = select(RunModel).where(RunModel.parent_run_id == run_id).order_by(RunModel.created_at.asc())
        rows = (await self.db.execute(query)).scalars().all()
        child_runs = [self._serialize_run(row) for row in rows]
        tree = {"run_id": run_id, "children": [{"run_id": child["id"], "children": []} for child in child_runs]}
        delegation_history = []
        if getattr(run, "delegation_mode", None):
            delegation_history.append(
                {
                    "run_id": run_id,
                    "delegation_mode": getattr(run, "delegation_mode", None),
                    "merge_strategy": getattr(run, "merge_strategy", None),
                    "join_group_id": getattr(run, "join_group_id", None),
                }
            )
        branch_groups_by_id: dict[str, dict[str, Any]] = {}
        for child in child_runs:
            join_group_id = child.get("join_group_id")
            if not join_group_id:
                continue
            group = branch_groups_by_id.setdefault(join_group_id, {"join_group_id": join_group_id, "branch_count": 0, "runs": []})
            group["branch_count"] += 1
            group["runs"].append(child["id"])
        return {
            "run_id": run_id,
            "parent_run": self._serialize_run(parent_run) if parent_run is not None else None,
            "child_runs": child_runs,
            "tree": tree,
            "delegation_history": delegation_history,
            "branch_groups": list(branch_groups_by_id.values()),
        }

    async def list_checkpoints(self, run_id: UUID) -> list[dict[str, Any]]:
        query = select(CheckpointModel).where(CheckpointModel.run_id == run_id).order_by(CheckpointModel.created_at.asc())
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize_checkpoint(row) for row in rows]

    async def list_events(self, run_id: UUID) -> list[dict[str, Any]]:
        query = select(RuntimeEventModel).where(RuntimeEventModel.run_id == run_id).order_by(RuntimeEventModel.created_at.asc())
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize_event(row) for row in rows]

    async def get_composite_debug(self, run_id: UUID) -> dict[str, Any]:
        run = await self.get_run(run_id)
        if run is None:
            return {"run_id": run_id, "delegation_history": [], "branch_groups": [], "merge_outcomes": []}
        lineage = await self.get_lineage(run_id)
        merge_outcomes = []
        if run.get("merge_strategy") or run.get("join_group_id"):
            merge_outcomes.append(
                {
                    "run_id": run_id,
                    "strategy": run.get("merge_strategy"),
                    "join_group_id": run.get("join_group_id"),
                    "output_keys": sorted((run.get("output_payload") or {}).keys()),
                }
            )
        return {
            "run_id": run_id,
            "delegation_history": lineage.get("delegation_history", []),
            "branch_groups": lineage.get("branch_groups", []),
            "merge_outcomes": merge_outcomes,
        }

    async def start_run(self, run_data: dict[str, Any]) -> dict[str, Any] | None:
        coordinator = await self._coordinator()
        run_id = await coordinator.execute_workflow(
            workflow_id=run_data["workflow_id"],
            workflow_version_id=run_data.get("workflow_version_id"),
            input_payload=run_data.get("input_payload", {}),
            workspace_id=run_data["workspace_id"],
            parent_run_id=run_data.get("parent_run_id"),
            spawned_by_step_id=run_data.get("spawned_by_step_id"),
        )
        return await self.get_run(run_id)

    async def resume_run(self, run_id: UUID, state_patch: dict[str, Any] | None = None) -> dict[str, Any] | None:
        coordinator = await self._coordinator()
        await coordinator.resume_run(run_id, state_patch=state_patch or {})
        return await self.get_run(run_id)

    async def cancel_run(self, run_id: UUID) -> dict[str, Any] | None:
        coordinator = await self._coordinator()
        await coordinator.cancel_run(run_id)
        return await self.get_run(run_id)
