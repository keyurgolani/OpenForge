from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.domains.workflows.service import WorkflowService
from tests.domains.graph._helpers import FakeAsyncSession


def _invalid_fanout_payload() -> dict:
    fanout_node_id = uuid4()
    terminal_node_id = uuid4()
    return {
        "state_schema": {"type": "object"},
        "default_input_schema": {"type": "object"},
        "default_output_schema": {"type": "object"},
        "entry_node_id": fanout_node_id,
        "change_note": "Invalid fanout without join",
        "nodes": [
            {
                "id": fanout_node_id,
                "node_key": "research.fanout",
                "node_type": "fanout",
                "label": "Fan out",
                "config": {
                    "fanout_source": "research_tasks",
                    "join_group_id": "research-group",
                    "child_workflow_id": str(uuid4()),
                },
                "status": "active",
            },
            {
                "id": terminal_node_id,
                "node_key": "terminal.done",
                "node_type": "terminal",
                "label": "Done",
                "config": {},
                "status": "active",
            },
        ],
        "edges": [
            {
                "id": uuid4(),
                "from_node_id": fanout_node_id,
                "to_node_id": terminal_node_id,
                "edge_type": "success",
                "priority": 100,
                "status": "active",
            }
        ],
    }


@pytest.mark.asyncio
async def test_create_workflow_rejects_fanout_without_matching_join() -> None:
    db = FakeAsyncSession()
    service = WorkflowService(db)

    with pytest.raises(ValueError, match="join"):
        await service.create_workflow(
            {
                "workspace_id": uuid4(),
                "name": "Invalid fanout",
                "slug": "invalid-fanout",
                "status": "draft",
                "is_template": True,
                "template_kind": "composite_pattern",
                "template_metadata": {"pattern": "fanout"},
                "version": _invalid_fanout_payload(),
            }
        )
