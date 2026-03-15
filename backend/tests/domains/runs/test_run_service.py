from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import CheckpointModel, RunModel, RunStepModel, RuntimeEventModel
from openforge.domains.runs.service import RunService
from tests.domains.graph._helpers import FakeAsyncSession, FakeExecuteResult


@pytest.mark.asyncio
async def test_run_service_lists_steps_lineage_checkpoints_and_events() -> None:
    run_id = uuid4()
    child_run_id = uuid4()
    node_id = uuid4()
    step = RunStepModel(
        id=uuid4(),
        run_id=run_id,
        node_id=node_id,
        node_key="artifact.publish",
        step_index=2,
        status="completed",
        input_snapshot={"review_text": "Ready"},
        output_snapshot={"artifact_ids": [str(uuid4())]},
        retry_count=0,
    )
    checkpoint = CheckpointModel(
        id=uuid4(),
        run_id=run_id,
        step_id=step.id,
        checkpoint_type="after_step",
        state_snapshot={"artifact_ids": ["artifact-1"]},
    )
    event = RuntimeEventModel(
        id=uuid4(),
        run_id=run_id,
        step_id=step.id,
        workflow_id=uuid4(),
        workflow_version_id=uuid4(),
        node_id=node_id,
        node_key="artifact.publish",
        event_type="artifact_emitted",
        payload_json={"artifact_id": str(uuid4())},
    )
    parent_run = RunModel(id=run_id, run_type="workflow", workspace_id=uuid4(), status="completed")
    child_run = RunModel(id=child_run_id, run_type="workflow", workspace_id=uuid4(), status="completed", parent_run_id=run_id)
    db = FakeAsyncSession(
        objects={(RunModel, run_id): parent_run},
        execute_results=[
            FakeExecuteResult([step]),
            FakeExecuteResult([child_run]),
            FakeExecuteResult([checkpoint]),
            FakeExecuteResult([event]),
        ],
    )
    service = RunService(db)

    steps = await service.list_steps(run_id)
    lineage = await service.get_lineage(run_id)
    checkpoints = await service.list_checkpoints(run_id)
    events = await service.list_events(run_id)

    assert steps[0]["node_key"] == "artifact.publish"
    assert lineage["child_runs"][0]["id"] == child_run_id
    assert checkpoints[0]["checkpoint_type"] == "after_step"
    assert events[0]["event_type"] == "artifact_emitted"
