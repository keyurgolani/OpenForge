"""Runtime coordinator for Phase 9 workflow execution."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select

from openforge.db.models import RunModel, RunStepModel

from .checkpoint_store import CheckpointStore
from .event_publisher import EventPublisher
from .events import (
    APPROVAL_REQUESTED,
    ARTIFACT_EMITTED,
    CHILD_RUN_SPAWNED,
    FANOUT_STARTED,
    HANDOFF_APPLIED,
    JOIN_COMPLETED,
    MERGE_APPLIED,
    RUN_CANCELLED,
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_INTERRUPTED,
    RUN_RESUMED,
    RUN_STARTED,
    STEP_COMPLETED,
    STEP_FAILED,
    STEP_STARTED,
    RuntimeEvent,
)
from .langgraph_adapter import compile_workflow_graph
from .lifecycle import finish_step, now_utc, start_step, transition_run
from .node_executors.base import NodeExecutionContext, NodeExecutionError, NodeExecutionResult
from .node_executors.registry import build_default_registry


class RuntimeCoordinator:
    """Coordinator for durable workflow execution."""

    def __init__(
        self,
        *,
        db,
        workflow_service,
        artifact_service,
        approval_service,
        checkpoint_store: CheckpointStore | None = None,
        event_publisher: EventPublisher | None = None,
        executor_registry=None,
        profile_registry=None,
        llm_service=None,
        llm_gateway=None,
        policy_engine=None,
        rate_limiter=None,
    ):
        self.db = db
        self.workflow_service = workflow_service
        self.artifact_service = artifact_service
        self.approval_service = approval_service
        self.checkpoint_store = checkpoint_store or CheckpointStore(db)
        self.event_publisher = event_publisher or EventPublisher(db)
        self.executor_registry = executor_registry or build_default_registry(
            artifact_service=artifact_service,
            approval_service=approval_service,
            profile_registry=profile_registry,
            llm_service=llm_service,
            llm_gateway=llm_gateway,
            policy_engine=policy_engine,
            rate_limiter=rate_limiter,
        )

    async def execute_workflow(
        self,
        workflow_id: UUID,
        input_payload: dict[str, Any],
        workspace_id: UUID,
        workflow_version_id: UUID | None = None,
        parent_run_id: UUID | None = None,
        spawned_by_step_id: UUID | None = None,
        delegation_mode: str | None = None,
        merge_strategy: str | None = None,
        join_group_id: str | None = None,
        branch_key: str | None = None,
        branch_index: int | None = None,
        handoff_reason: str | None = None,
        composite_metadata: dict[str, Any] | None = None,
    ) -> UUID:
        workflow = await self.workflow_service.get_runtime_workflow(workflow_id, workflow_version_id)
        if workflow is None:
            raise ValueError(f"Workflow {workflow_id} not found")
        root_run_id = None
        if parent_run_id is not None:
            parent_run = await self.db.get(RunModel, parent_run_id)
            root_run_id = getattr(parent_run, "root_run_id", None) or getattr(parent_run, "id", None) or parent_run_id

        run = RunModel(
            run_type="subworkflow" if parent_run_id else "workflow",
            workflow_id=workflow_id,
            workflow_version_id=workflow["current_version"]["id"],
            workspace_id=workspace_id,
            parent_run_id=parent_run_id,
            root_run_id=root_run_id,
            spawned_by_step_id=spawned_by_step_id,
            status="pending",
            input_payload=input_payload,
            state_snapshot=dict(input_payload),
            output_payload={},
            delegation_mode=delegation_mode,
            merge_strategy=merge_strategy,
            join_group_id=join_group_id,
            branch_key=branch_key,
            branch_index=branch_index,
            handoff_reason=handoff_reason,
            composite_metadata=composite_metadata or {},
            started_at=now_utc(),
        )
        self.db.add(run)
        await self.db.flush()
        if run.root_run_id is None:
            run.root_run_id = run.id

        await self.event_publisher.publish(
            RuntimeEvent(
                run_id=run.id,
                event_type=RUN_STARTED,
                workflow_id=workflow["id"],
                workflow_version_id=workflow["current_version"]["id"],
                payload={"backend": compile_workflow_graph(workflow).backend},
            )
        )
        await self._continue_run(run, workflow, state_patch={})
        await self.db.commit()
        return run.id

    async def resume_run(self, run_id: UUID, *, state_patch: dict[str, Any] | None = None) -> None:
        run = await self.db.get(RunModel, run_id)
        if run is None:
            raise ValueError(f"Run {run_id} not found")
        workflow = await self.workflow_service.get_runtime_workflow(run.workflow_id, run.workflow_version_id)
        if workflow is None:
            raise ValueError(f"Workflow {run.workflow_id} not found for run {run_id}")
        state = dict(run.state_snapshot or {})
        state.update(state_patch or {})
        graph = compile_workflow_graph(workflow)
        if run.status == "waiting_approval" and run.current_node_id is not None:
            current_node = graph.nodes.get(run.current_node_id)
            approval_request_id = state.get("approval_request_id")
            if current_node is not None and current_node.get("node_type") == "approval" and approval_request_id is not None:
                request = await self.approval_service.get_request(approval_request_id)
                if request is not None and request.status in {"approved", "denied"}:
                    state["approval_status"] = request.status
                    run.current_node_id = graph.next_node_id(run.current_node_id, request.status)
                    run.state_snapshot = dict(state)
        await self.event_publisher.publish(
            RuntimeEvent(
                run_id=run.id,
                event_type=RUN_RESUMED,
                workflow_id=workflow["id"],
                workflow_version_id=workflow["current_version"]["id"],
                payload={"state_patch": state_patch or {}},
            )
        )
        await self._continue_run(run, workflow, state_patch=state if run.status == "waiting_approval" else (state_patch or {}))
        await self.db.commit()

    async def cancel_run(self, run_id: UUID) -> None:
        run = await self.db.get(RunModel, run_id)
        if run is None:
            raise ValueError(f"Run {run_id} not found")
        transition_run(run, "cancelled")
        await self.event_publisher.publish(
            RuntimeEvent(
                run_id=run.id,
                event_type=RUN_CANCELLED,
                workflow_id=run.workflow_id,
                workflow_version_id=run.workflow_version_id,
                payload={},
            )
        )
        await self.db.commit()

    async def _continue_run(self, run: RunModel, workflow: dict[str, Any], *, state_patch: dict[str, Any]) -> None:
        graph = compile_workflow_graph(workflow)
        state = dict(run.state_snapshot or {})
        state.update(state_patch)
        current_node_id = run.current_node_id or graph.entry_node_id
        if current_node_id is None:
            transition_run(run, "failed", error_code="missing_entry_node", error_message="Workflow has no entry node")
            return

        while current_node_id is not None:
            if run.status == "cancelled":
                return

            node = graph.nodes[current_node_id]
            # Re-assert running on each step; skip validation when already running
            transition_run(run, "running", validate=(run.status != "running"))
            run.current_node_id = current_node_id

            step = RunStepModel(
                run_id=run.id,
                node_id=current_node_id,
                node_key=node.get("node_key"),
                step_index=await self._next_step_index(run.id),
                status="pending",
                input_snapshot=dict(state),
                delegation_mode=node.get("config", {}).get("delegation_mode"),
                merge_strategy=node.get("config", {}).get("merge_strategy") or node.get("config", {}).get("strategy"),
                join_group_id=node.get("config", {}).get("join_group_id"),
                handoff_reason=node.get("config", {}).get("handoff_reason"),
                composite_metadata={"node_type": node.get("node_type")},
            )
            self.db.add(step)
            await self.db.flush()
            start_step(step)

            before_checkpoint = await self.checkpoint_store.create_checkpoint(
                run.id,
                dict(state),
                step_id=step.id,
                checkpoint_type="before_step",
                metadata={"node_key": node.get("node_key")},
            )
            step.checkpoint_id = before_checkpoint["id"]

            await self.event_publisher.publish(
                RuntimeEvent(
                    run_id=run.id,
                    step_id=step.id,
                    workflow_id=workflow["id"],
                    workflow_version_id=workflow["current_version"]["id"],
                    node_id=current_node_id,
                    node_key=node.get("node_key"),
                    event_type=STEP_STARTED,
                    payload={},
                )
            )

            try:
                result = await self._execute_node(step, run, workflow, node, state)
            except NodeExecutionError as exc:
                finish_step(step, "failed", error_code=exc.code, error_message=str(exc))
                transition_run(run, "failed", error_code=exc.code, error_message=str(exc))
                run.state_snapshot = dict(state)
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=STEP_FAILED,
                        payload={"error_code": exc.code, "message": str(exc)},
                    )
                )
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=RUN_FAILED,
                        payload={"error_code": exc.code, "message": str(exc)},
                    )
                )
                return

            state = dict(result.state)
            step.output_snapshot = dict(state)
            after_checkpoint = await self.checkpoint_store.create_checkpoint(
                run.id,
                dict(state),
                step_id=step.id,
                checkpoint_type="after_step",
                metadata={"node_key": node.get("node_key")},
            )
            step.checkpoint_id = after_checkpoint["id"]

            if result.interrupt:
                finish_step(step, "completed")
                run.state_snapshot = dict(state)
                transition_run(run, result.interrupt_status or "interrupted")
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=STEP_COMPLETED,
                        payload={"interrupted": True},
                    )
                )
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=RUN_INTERRUPTED,
                        payload={"approval_request_id": str(result.approval_request_id) if result.approval_request_id else None},
                    )
                )
                if result.approval_request_id is not None:
                    await self.event_publisher.publish(
                        RuntimeEvent(
                            run_id=run.id,
                            step_id=step.id,
                            workflow_id=workflow["id"],
                            workflow_version_id=workflow["current_version"]["id"],
                            node_id=current_node_id,
                            node_key=node.get("node_key"),
                            event_type=APPROVAL_REQUESTED,
                            payload={"approval_request_id": str(result.approval_request_id)},
                        )
                    )
                return

            finish_step(step, "completed")
            run.state_snapshot = dict(state)
            await self.event_publisher.publish(
                RuntimeEvent(
                    run_id=run.id,
                    step_id=step.id,
                    workflow_id=workflow["id"],
                    workflow_version_id=workflow["current_version"]["id"],
                    node_id=current_node_id,
                    node_key=node.get("node_key"),
                    event_type=STEP_COMPLETED,
                    payload={},
                )
            )

            if result.emitted_artifact_ids:
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=ARTIFACT_EMITTED,
                        payload={"artifact_ids": [str(value) for value in result.emitted_artifact_ids]},
                    )
                )

            for spawned_run_id in result.spawned_run_ids or ([result.spawned_run_id] if result.spawned_run_id else []):
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=CHILD_RUN_SPAWNED,
                        payload={"child_run_id": str(spawned_run_id)},
                    )
                )

            if node.get("node_type") == "fanout":
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=FANOUT_STARTED,
                        payload={"join_group_id": node.get("config", {}).get("join_group_id")},
                    )
                )

            if node.get("node_type") == "handoff":
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=HANDOFF_APPLIED,
                        payload={"handoff": state.get("handoff", {})},
                    )
                )

            if node.get("node_type") == "join":
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=JOIN_COMPLETED,
                        payload={"join_group_id": node.get("config", {}).get("join_group_id")},
                    )
                )

            if node.get("node_type") in {"delegate_call", "subworkflow", "reduce"}:
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=MERGE_APPLIED,
                        payload={"merge_strategy": node.get("config", {}).get("merge_strategy") or node.get("config", {}).get("strategy")},
                    )
                )

            if node.get("node_type") == "terminal":
                run.output_payload = dict(state)
                transition_run(run, "completed")
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=RUN_COMPLETED,
                        payload={"output": run.output_payload},
                    )
                )
                return

            next_node_id = graph.next_node_id(current_node_id, result.next_edge_type)
            if next_node_id is None:
                run.output_payload = dict(state)
                transition_run(run, "completed")
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run.id,
                        step_id=step.id,
                        workflow_id=workflow["id"],
                        workflow_version_id=workflow["current_version"]["id"],
                        node_id=current_node_id,
                        node_key=node.get("node_key"),
                        event_type=RUN_COMPLETED,
                        payload={"output": run.output_payload},
                    )
                )
                return
            current_node_id = next_node_id

    async def _execute_node(
        self,
        step: RunStepModel,
        run: RunModel,
        workflow: dict[str, Any],
        node: dict[str, Any],
        state: dict[str, Any],
    ) -> NodeExecutionResult:
        if node.get("node_type") == "terminal":
            return NodeExecutionResult(state=dict(state), output=dict(state))

        executor = self.executor_registry.resolve(node["node_type"])
        context = NodeExecutionContext(
            run=run,
            workflow=workflow,
            workflow_version=workflow["current_version"],
            node=node,
            state=dict(state),
            step_index=step.step_index,
            step_id=step.id,
            coordinator=self,
        )
        return await executor.execute(context)

    async def _next_step_index(self, run_id: UUID) -> int:
        existing_added = [
            obj.step_index
            for obj in getattr(self.db, "added", [])
            if isinstance(obj, RunStepModel) and obj.run_id == run_id
        ]
        if existing_added:
            return max(existing_added) + 1
        query = select(RunStepModel).where(RunStepModel.run_id == run_id).order_by(RunStepModel.step_index.desc())
        row = (await self.db.execute(query)).scalars().all()
        if not row:
            return 1
        return int(row[0].step_index) + 1
