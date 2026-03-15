"""Deterministic workflow blueprints for Phase 9 runtime foundations."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase9/workflows")
DEFAULT_SEED_WORKSPACE_ID = uuid5(SEED_NAMESPACE, "workspace")


class WorkflowSeeder(Protocol):
    """Protocol for workflow seed helpers."""

    async def create_workflow(self, workflow_data: dict[str, Any]) -> dict[str, Any]:
        ...


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def get_seed_workflow_blueprints(workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Return deterministic workflow blueprints for dev and test environments."""

    resolved_workspace_id = workspace_id or DEFAULT_SEED_WORKSPACE_ID
    review_node_id = _seed_uuid("review-and-publish/review.prepare")
    approval_node_id = _seed_uuid("review-and-publish/approval.publish")
    artifact_node_id = _seed_uuid("review-and-publish/artifact.publish")
    terminal_node_id = _seed_uuid("review-and-publish/terminal.done")

    return [
        {
            "slug": "review-and-publish",
            "workflow": {
                "workspace_id": resolved_workspace_id,
                "name": "Review and Publish",
                "slug": "review-and-publish",
                "description": "Review generated output, require approval, and emit a durable artifact through the Phase 9 runtime.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "version": {
                    "entry_node_id": review_node_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "request": {"type": "string"},
                            "review_text": {"type": "string"},
                            "approval_status": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["request"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"request": {"type": "string"}},
                        "required": ["request"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "review_text": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Phase 9 seed workflow proving approval, artifact emission, and terminal execution.",
                    "nodes": [
                        {
                            "id": review_node_id,
                            "node_key": "review.prepare",
                            "node_type": "tool",
                            "label": "Prepare review",
                            "description": "Turn the request into review-ready text.",
                            "executor_ref": "tool.template",
                            "config": {
                                "operation": "template",
                                "template": "Reviewed request: {request}",
                                "output_key": "review_text",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": approval_node_id,
                            "node_key": "approval.publish",
                            "node_type": "approval",
                            "label": "Approval gate",
                            "description": "Pause until an operator approves publication.",
                            "executor_ref": "approval.request",
                            "config": {
                                "requested_action": "Publish reviewed output",
                                "risk_category": "medium",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": artifact_node_id,
                            "node_key": "artifact.publish",
                            "node_type": "artifact",
                            "label": "Publish artifact",
                            "description": "Emit the reviewed output as a durable report artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Reviewed publish request",
                                "body_template": "{review_text}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by Phase 9 seed workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": terminal_node_id,
                            "node_key": "terminal.done",
                            "node_type": "terminal",
                            "label": "Done",
                            "description": "Mark the workflow complete.",
                            "executor_ref": "terminal.complete",
                            "config": {},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                    ],
                    "edges": [
                        {
                            "id": _seed_uuid("review-and-publish/edge/review-to-approval"),
                            "from_node_id": review_node_id,
                            "to_node_id": approval_node_id,
                            "edge_type": "success",
                            "condition": {},
                            "priority": 100,
                            "label": "Prepared",
                            "status": "active",
                        },
                        {
                            "id": _seed_uuid("review-and-publish/edge/approval-to-artifact"),
                            "from_node_id": approval_node_id,
                            "to_node_id": artifact_node_id,
                            "edge_type": "approved",
                            "condition": {},
                            "priority": 100,
                            "label": "Approved",
                            "status": "active",
                        },
                        {
                            "id": _seed_uuid("review-and-publish/edge/artifact-to-terminal"),
                            "from_node_id": artifact_node_id,
                            "to_node_id": terminal_node_id,
                            "edge_type": "success",
                            "condition": {},
                            "priority": 100,
                            "label": "Published",
                            "status": "active",
                        },
                    ],
                },
            },
        }
    ]


async def seed_example_workflows(service: WorkflowSeeder, workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Seed deterministic workflow definitions through the workflow service."""

    created_workflows: list[dict[str, Any]] = []
    for blueprint in get_seed_workflow_blueprints(workspace_id):
        created_workflows.append(await service.create_workflow(blueprint["workflow"]))
    return created_workflows
