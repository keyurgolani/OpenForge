"""Deterministic workflow blueprints for Phase 10 composite runtime foundations."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase10/workflows")
DEFAULT_SEED_WORKSPACE_ID = uuid5(SEED_NAMESPACE, "workspace")


class WorkflowSeeder(Protocol):
    """Protocol for workflow seed helpers."""

    async def create_workflow(self, workflow_data: dict[str, Any]) -> dict[str, Any]:
        ...


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def _composite_template_metadata(pattern: str, *badges: str) -> dict[str, Any]:
    return {
        "pattern": pattern,
        "badges": list(badges),
        "recommended_use_cases": [pattern.replace("_", " ")],
        "internal_pattern": True,
    }


def get_seed_workflow_blueprints(workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Return deterministic workflow blueprints for dev and test environments."""

    resolved_workspace_id = workspace_id or DEFAULT_SEED_WORKSPACE_ID

    review_workflow_id = _seed_uuid("review-and-publish/workflow")
    review_node_id = _seed_uuid("review-and-publish/review.prepare")
    approval_node_id = _seed_uuid("review-and-publish/approval.publish")
    artifact_node_id = _seed_uuid("review-and-publish/artifact.publish")
    review_terminal_node_id = _seed_uuid("review-and-publish/terminal.done")

    plan_workflow_id = _seed_uuid("plan-execute-review/workflow")
    plan_node_id = _seed_uuid("plan-execute-review/plan.prepare")
    execute_node_id = _seed_uuid("plan-execute-review/execute.delegate")
    plan_terminal_node_id = _seed_uuid("plan-execute-review/terminal.done")

    map_reduce_workflow_id = _seed_uuid("map-reduce-research/workflow")
    map_reduce_fanout_id = _seed_uuid("map-reduce-research/research.fanout")
    map_reduce_join_id = _seed_uuid("map-reduce-research/research.join")
    map_reduce_reduce_id = _seed_uuid("map-reduce-research/research.reduce")
    map_reduce_terminal_id = _seed_uuid("map-reduce-research/terminal.done")

    council_workflow_id = _seed_uuid("reviewer-council-reduce/workflow")
    council_fanout_id = _seed_uuid("reviewer-council-reduce/council.fanout")
    council_join_id = _seed_uuid("reviewer-council-reduce/council.join")
    council_reduce_id = _seed_uuid("reviewer-council-reduce/council.reduce")
    council_terminal_id = _seed_uuid("reviewer-council-reduce/terminal.done")

    return [
        {
            "slug": "review-and-publish",
            "workflow": {
                "id": review_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Review and Publish",
                "slug": "review-and-publish",
                "description": "Review generated output, require approval, and emit a durable artifact through the runtime.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "composite_pattern",
                "template_metadata": _composite_template_metadata("review_publish", "approval", "artifact"),
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
                    "change_note": "Phase 10 review and publish template.",
                    "nodes": [
                        {
                            "id": review_node_id,
                            "node_key": "review.prepare",
                            "node_type": "tool",
                            "label": "Prepare review",
                            "description": "Turn the request into review-ready text.",
                            "executor_ref": "tool.template",
                            "config": {"operation": "template", "template": "Reviewed request: {request}", "output_key": "review_text"},
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
                            "config": {"requested_action": "Publish reviewed output", "risk_category": "medium"},
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
                                "change_note": "Created by Phase 10 seed workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": review_terminal_node_id,
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
                        {"id": _seed_uuid("review-and-publish/edge/review-to-approval"), "from_node_id": review_node_id, "to_node_id": approval_node_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Prepared", "status": "active"},
                        {"id": _seed_uuid("review-and-publish/edge/approval-to-artifact"), "from_node_id": approval_node_id, "to_node_id": artifact_node_id, "edge_type": "approved", "condition": {}, "priority": 100, "label": "Approved", "status": "active"},
                        {"id": _seed_uuid("review-and-publish/edge/artifact-to-terminal"), "from_node_id": artifact_node_id, "to_node_id": review_terminal_node_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Published", "status": "active"},
                    ],
                },
            },
        },
        {
            "slug": "plan-execute-review",
            "workflow": {
                "id": plan_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Plan Execute Review",
                "slug": "plan-execute-review",
                "description": "Plan work, delegate execution, and carry the merged result forward.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "composite_pattern",
                "template_metadata": _composite_template_metadata("plan_execute_review", "delegate_call", "review"),
                "version": {
                    "entry_node_id": plan_node_id,
                    "state_schema": {"type": "object", "properties": {"request": {"type": "string"}, "plan_text": {"type": "string"}, "review_text": {"type": "string"}}},
                    "default_input_schema": {"type": "object", "required": ["request"]},
                    "default_output_schema": {"type": "object", "properties": {"review_text": {"type": "string"}}},
                    "status": "active",
                    "change_note": "Phase 10 plan-execute-review template.",
                    "nodes": [
                        {
                            "id": plan_node_id,
                            "node_key": "plan.prepare",
                            "node_type": "tool",
                            "label": "Plan request",
                            "description": "Draft a plan summary from the input request.",
                            "executor_ref": "tool.template",
                            "config": {"operation": "template", "template": "Plan for: {request}", "output_key": "plan_text"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": execute_node_id,
                            "node_key": "execute.delegate",
                            "node_type": "delegate_call",
                            "label": "Delegate review workflow",
                            "description": "Run the review-and-publish child workflow as a bounded delegated step.",
                            "executor_ref": "runtime.delegate_call",
                            "config": {
                                "delegation_mode": "call",
                                "child_workflow_id": str(review_workflow_id),
                                "input_mapping": {"request": "plan_text"},
                                "output_mapping": {"review_text": "review_text"},
                                "merge_strategy": "direct",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": plan_terminal_node_id,
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
                        {"id": _seed_uuid("plan-execute-review/edge/plan-to-execute"), "from_node_id": plan_node_id, "to_node_id": execute_node_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Planned", "status": "active"},
                        {"id": _seed_uuid("plan-execute-review/edge/execute-to-terminal"), "from_node_id": execute_node_id, "to_node_id": plan_terminal_node_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Reviewed", "status": "active"},
                    ],
                },
            },
        },
        {
            "slug": "map-reduce-research",
            "workflow": {
                "id": map_reduce_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Map Reduce Research",
                "slug": "map-reduce-research",
                "description": "Fan out research branches, join results, and reduce them into a final summary.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "composite_pattern",
                "template_metadata": _composite_template_metadata("map_reduce_research", "fanout", "join", "reduce"),
                "version": {
                    "entry_node_id": map_reduce_fanout_id,
                    "state_schema": {"type": "object", "properties": {"research_tasks": {"type": "array"}, "research_summary": {"type": "string"}}},
                    "default_input_schema": {"type": "object", "required": ["research_tasks"]},
                    "default_output_schema": {"type": "object", "properties": {"research_summary": {"type": "string"}}},
                    "status": "active",
                    "change_note": "Phase 10 map-reduce proof template.",
                    "nodes": [
                        {
                            "id": map_reduce_fanout_id,
                            "node_key": "research.fanout",
                            "node_type": "fanout",
                            "label": "Fan out research branches",
                            "description": "Launch a child review workflow for each research task.",
                            "executor_ref": "runtime.fanout",
                            "config": {
                                "delegation_mode": "fanout",
                                "child_workflow_id": str(review_workflow_id),
                                "fanout_items_key": "research_tasks",
                                "join_group_id": "research-branches",
                                "input_mapping": {"request": "item"},
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": map_reduce_join_id,
                            "node_key": "research.join",
                            "node_type": "join",
                            "label": "Join research branches",
                            "description": "Normalize research branch outputs into a collection.",
                            "executor_ref": "runtime.join",
                            "config": {"join_group_id": "research-branches", "output_key": "joined_branches"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": map_reduce_reduce_id,
                            "node_key": "research.reduce",
                            "node_type": "reduce",
                            "label": "Reduce branch outputs",
                            "description": "Reduce branch outputs into a final research summary.",
                            "executor_ref": "runtime.reduce",
                            "config": {"join_group_id": "research-branches", "source_key": "joined_branches", "output_key": "research_summary", "strategy": "concat_field", "field": "review_text"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": map_reduce_terminal_id,
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
                        {"id": _seed_uuid("map-reduce-research/edge/fanout-to-join"), "from_node_id": map_reduce_fanout_id, "to_node_id": map_reduce_join_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Branches complete", "status": "active"},
                        {"id": _seed_uuid("map-reduce-research/edge/join-to-reduce"), "from_node_id": map_reduce_join_id, "to_node_id": map_reduce_reduce_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Joined", "status": "active"},
                        {"id": _seed_uuid("map-reduce-research/edge/reduce-to-terminal"), "from_node_id": map_reduce_reduce_id, "to_node_id": map_reduce_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Reduced", "status": "active"},
                    ],
                },
            },
        },
        {
            "slug": "reviewer-council-reduce",
            "workflow": {
                "id": council_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Reviewer Council Reduce",
                "slug": "reviewer-council-reduce",
                "description": "Run multiple reviewer branches and reduce their outputs into one final verdict.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "composite_pattern",
                "template_metadata": _composite_template_metadata("reviewer_council_reduce", "fanout", "council", "reduce"),
                "version": {
                    "entry_node_id": council_fanout_id,
                    "state_schema": {"type": "object", "properties": {"review_tasks": {"type": "array"}, "council_summary": {"type": "string"}}},
                    "default_input_schema": {"type": "object", "required": ["review_tasks"]},
                    "default_output_schema": {"type": "object", "properties": {"council_summary": {"type": "string"}}},
                    "status": "active",
                    "change_note": "Phase 10 reviewer council template.",
                    "nodes": [
                        {
                            "id": council_fanout_id,
                            "node_key": "council.fanout",
                            "node_type": "fanout",
                            "label": "Fan out reviewers",
                            "description": "Launch child review workflows for council members.",
                            "executor_ref": "runtime.fanout",
                            "config": {
                                "delegation_mode": "fanout",
                                "child_workflow_id": str(review_workflow_id),
                                "fanout_items_key": "review_tasks",
                                "join_group_id": "reviewer-council",
                                "input_mapping": {"request": "item"},
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": council_join_id,
                            "node_key": "council.join",
                            "node_type": "join",
                            "label": "Join reviewer branches",
                            "description": "Normalize council review outputs.",
                            "executor_ref": "runtime.join",
                            "config": {"join_group_id": "reviewer-council", "output_key": "council_reviews"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": council_reduce_id,
                            "node_key": "council.reduce",
                            "node_type": "reduce",
                            "label": "Reduce reviewer outputs",
                            "description": "Reduce the council reviews into one summary.",
                            "executor_ref": "runtime.reduce",
                            "config": {"join_group_id": "reviewer-council", "source_key": "council_reviews", "output_key": "council_summary", "strategy": "concat_field", "field": "review_text"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": council_terminal_id,
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
                        {"id": _seed_uuid("reviewer-council-reduce/edge/fanout-to-join"), "from_node_id": council_fanout_id, "to_node_id": council_join_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Branches complete", "status": "active"},
                        {"id": _seed_uuid("reviewer-council-reduce/edge/join-to-reduce"), "from_node_id": council_join_id, "to_node_id": council_reduce_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Joined", "status": "active"},
                        {"id": _seed_uuid("reviewer-council-reduce/edge/reduce-to-terminal"), "from_node_id": council_reduce_id, "to_node_id": council_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Reduced", "status": "active"},
                    ],
                },
            },
        },
    ]


async def seed_example_workflows(service: WorkflowSeeder, workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Seed deterministic workflow definitions through the workflow service."""

    created_workflows: list[dict[str, Any]] = []
    for blueprint in get_seed_workflow_blueprints(workspace_id):
        created_workflows.append(await service.create_workflow(blueprint["workflow"]))
    return created_workflows
