"""Deterministic workflow blueprints for composite workflow runtime foundations."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase10/workflows")


class WorkflowSeeder(Protocol):
    """Protocol for workflow seed helpers."""

    async def create_workflow(self, workflow_data: dict[str, Any]) -> dict[str, Any]:
        ...


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def _composite_template_metadata(
    pattern: str,
    *badges: str,
    recommended_use_cases: list[str] | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "pattern": pattern,
        "badges": list(badges),
        "recommended_use_cases": recommended_use_cases or [pattern.replace("_", " ")],
        "internal_pattern": True,
    }
    if tags is not None:
        meta["tags"] = tags
    return meta


def _catalog_template_metadata(
    pattern: str,
    *badges: str,
    recommended_use_cases: list[str] | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Build template metadata for curated workflow catalog entries."""
    return {
        "pattern": pattern,
        "badges": list(badges),
        "recommended_use_cases": recommended_use_cases or [pattern.replace("_", " ")],
        "internal_pattern": True,
        "tags": tags or [],
    }


def get_seed_workflow_blueprints(workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Return deterministic workflow blueprints for dev and test environments."""

    resolved_workspace_id = workspace_id or None

    def _decorate_blueprints(blueprints: list[dict[str, Any]]) -> list[dict[str, Any]]:
        decorated: list[dict[str, Any]] = []
        for blueprint in blueprints:
            workflow = blueprint.get("workflow", {})
            decorated.append(
                {
                    **blueprint,
                    "name": workflow.get("name"),
                    "description": workflow.get("description"),
                }
            )
        return decorated

    # ── 1. Review and Publish ────────────────────────────────────────────
    review_workflow_id = _seed_uuid("review-and-publish/workflow")
    review_node_id = _seed_uuid("review-and-publish/review.prepare")
    approval_node_id = _seed_uuid("review-and-publish/approval.publish")
    artifact_node_id = _seed_uuid("review-and-publish/artifact.publish")
    review_terminal_node_id = _seed_uuid("review-and-publish/terminal.done")

    # ── 2. Plan Execute Review ───────────────────────────────────────────
    plan_workflow_id = _seed_uuid("plan-execute-review/workflow")
    plan_node_id = _seed_uuid("plan-execute-review/plan.prepare")
    execute_node_id = _seed_uuid("plan-execute-review/execute.delegate")
    plan_terminal_node_id = _seed_uuid("plan-execute-review/terminal.done")

    # ── 3. Map Reduce Research ───────────────────────────────────────────
    map_reduce_workflow_id = _seed_uuid("map-reduce-research/workflow")
    map_reduce_fanout_id = _seed_uuid("map-reduce-research/research.fanout")
    map_reduce_join_id = _seed_uuid("map-reduce-research/research.join")
    map_reduce_reduce_id = _seed_uuid("map-reduce-research/research.reduce")
    map_reduce_terminal_id = _seed_uuid("map-reduce-research/terminal.done")

    # ── 4. Reviewer Council Reduce ───────────────────────────────────────
    council_workflow_id = _seed_uuid("reviewer-council-reduce/workflow")
    council_fanout_id = _seed_uuid("reviewer-council-reduce/council.fanout")
    council_join_id = _seed_uuid("reviewer-council-reduce/council.join")
    council_reduce_id = _seed_uuid("reviewer-council-reduce/council.reduce")
    council_terminal_id = _seed_uuid("reviewer-council-reduce/terminal.done")

    # ── 5. Internet Research ─────────────────────────────────────────────
    inet_workflow_id = _seed_uuid("internet-research/workflow")
    inet_query_plan_id = _seed_uuid("internet-research/query.plan")
    inet_search_exec_id = _seed_uuid("internet-research/search.execute")
    inet_synthesize_id = _seed_uuid("internet-research/synthesize.results")
    inet_artifact_id = _seed_uuid("internet-research/artifact.emit")
    inet_terminal_id = _seed_uuid("internet-research/terminal.done")

    # ── 6. Internet Deep Research ────────────────────────────────────────
    deep_workflow_id = _seed_uuid("internet-deep-research/workflow")
    deep_decompose_id = _seed_uuid("internet-deep-research/decompose.queries")
    deep_fanout_id = _seed_uuid("internet-deep-research/search.fanout")
    deep_join_id = _seed_uuid("internet-deep-research/search.join")
    deep_reduce_id = _seed_uuid("internet-deep-research/synthesize.reduce")
    deep_verify_id = _seed_uuid("internet-deep-research/verify.quality")
    deep_artifact_id = _seed_uuid("internet-deep-research/artifact.emit")
    deep_terminal_id = _seed_uuid("internet-deep-research/terminal.done")

    # ── 7. Exploratory Swarm ─────────────────────────────────────────────
    swarm_workflow_id = _seed_uuid("exploratory-swarm/workflow")
    swarm_directions_id = _seed_uuid("exploratory-swarm/generate.directions")
    swarm_fanout_id = _seed_uuid("exploratory-swarm/explore.fanout")
    swarm_join_id = _seed_uuid("exploratory-swarm/explore.join")
    swarm_reduce_id = _seed_uuid("exploratory-swarm/synthesize.discoveries")
    swarm_artifact_id = _seed_uuid("exploratory-swarm/artifact.emit")
    swarm_terminal_id = _seed_uuid("exploratory-swarm/terminal.done")

    # ── 8. Verify and Refine ─────────────────────────────────────────────
    vr_workflow_id = _seed_uuid("verify-and-refine/workflow")
    vr_verify_id = _seed_uuid("verify-and-refine/verify.claims")
    vr_gaps_id = _seed_uuid("verify-and-refine/identify.gaps")
    vr_refine_id = _seed_uuid("verify-and-refine/refine.content")
    vr_approval_id = _seed_uuid("verify-and-refine/approval.gate")
    vr_artifact_id = _seed_uuid("verify-and-refine/artifact.emit")
    vr_terminal_id = _seed_uuid("verify-and-refine/terminal.done")

    # ── 9. Multi-Source Synthesis ─────────────────────────────────────────
    mss_workflow_id = _seed_uuid("multi-source-synthesis/workflow")
    mss_fanout_id = _seed_uuid("multi-source-synthesis/analyze.fanout")
    mss_join_id = _seed_uuid("multi-source-synthesis/analyze.join")
    mss_reduce_id = _seed_uuid("multi-source-synthesis/synthesize.reduce")
    mss_artifact_id = _seed_uuid("multi-source-synthesis/artifact.emit")
    mss_terminal_id = _seed_uuid("multi-source-synthesis/terminal.done")

    # ── 10. Workspace Discovery ──────────────────────────────────────────
    wd_workflow_id = _seed_uuid("workspace-discovery/workflow")
    wd_scan_id = _seed_uuid("workspace-discovery/scan.knowledge")
    wd_patterns_id = _seed_uuid("workspace-discovery/analyze.patterns")
    wd_insights_id = _seed_uuid("workspace-discovery/generate.insights")
    wd_artifact_id = _seed_uuid("workspace-discovery/artifact.emit")
    wd_terminal_id = _seed_uuid("workspace-discovery/terminal.done")

    return _decorate_blueprints([
        # ─────────────────────────────────────────────────────────────────
        # 1. Review and Publish
        # ─────────────────────────────────────────────────────────────────
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
                "template_metadata": _composite_template_metadata(
                    "review_publish", "approval", "artifact",
                    tags=["composite", "review", "approval", "artifact"],
                ),
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
                    "change_note": "Review and publish template.",
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
                                "change_note": "Created by seed workflow",
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
        # ─────────────────────────────────────────────────────────────────
        # 2. Plan Execute Review
        # ─────────────────────────────────────────────────────────────────
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
                "template_metadata": _composite_template_metadata(
                    "plan_execute_review", "delegate_call", "review",
                    tags=["composite", "delegation", "planning"],
                ),
                "version": {
                    "entry_node_id": plan_node_id,
                    "state_schema": {"type": "object", "properties": {"request": {"type": "string"}, "plan_text": {"type": "string"}, "review_text": {"type": "string"}}},
                    "default_input_schema": {"type": "object", "required": ["request"]},
                    "default_output_schema": {"type": "object", "properties": {"review_text": {"type": "string"}}},
                    "status": "active",
                    "change_note": "Plan-execute-review template.",
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
        # ─────────────────────────────────────────────────────────────────
        # 3. Map Reduce Research
        # ─────────────────────────────────────────────────────────────────
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
                "template_metadata": _composite_template_metadata(
                    "map_reduce_research", "fanout", "join", "reduce",
                    tags=["composite", "research", "map-reduce", "fanout"],
                ),
                "version": {
                    "entry_node_id": map_reduce_fanout_id,
                    "state_schema": {"type": "object", "properties": {"research_tasks": {"type": "array"}, "research_summary": {"type": "string"}}},
                    "default_input_schema": {"type": "object", "required": ["research_tasks"]},
                    "default_output_schema": {"type": "object", "properties": {"research_summary": {"type": "string"}}},
                    "status": "active",
                    "change_note": "Map-reduce proof template.",
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
        # ─────────────────────────────────────────────────────────────────
        # 4. Reviewer Council Reduce
        # ─────────────────────────────────────────────────────────────────
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
                "template_metadata": _composite_template_metadata(
                    "reviewer_council_reduce", "fanout", "council", "reduce",
                    tags=["composite", "council", "review", "reduce"],
                ),
                "version": {
                    "entry_node_id": council_fanout_id,
                    "state_schema": {"type": "object", "properties": {"review_tasks": {"type": "array"}, "council_summary": {"type": "string"}}},
                    "default_input_schema": {"type": "object", "required": ["review_tasks"]},
                    "default_output_schema": {"type": "object", "properties": {"council_summary": {"type": "string"}}},
                    "status": "active",
                    "change_note": "Reviewer council template.",
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
        # ─────────────────────────────────────────────────────────────────
        # 5. Internet Research
        # ─────────────────────────────────────────────────────────────────
        {
            "slug": "internet-research",
            "workflow": {
                "id": inet_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Internet Research",
                "slug": "internet-research",
                "description": "Plan search queries, execute web searches, synthesize findings, and emit a research artifact.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "curated_workflow",
                "template_metadata": _catalog_template_metadata(
                    "internet_research", "llm", "tool", "artifact",
                    recommended_use_cases=[
                        "Quick web-based fact finding",
                        "Single-topic internet research",
                        "Source-backed answer generation",
                    ],
                    tags=["research", "internet", "search"],
                ),
                "version": {
                    "entry_node_id": inet_query_plan_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "search_plan": {"type": "string"},
                            "search_results": {"type": "string"},
                            "synthesis": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["query"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"query": {"type": "string"}},
                        "required": ["query"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "synthesis": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Curated internet research workflow template.",
                    "nodes": [
                        {
                            "id": inet_query_plan_id,
                            "node_key": "query.plan",
                            "node_type": "llm",
                            "label": "Plan search queries",
                            "description": "Use an LLM to decompose the user query into effective search queries.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a research query planner. Given a user question, produce a concise search plan with 1-3 search queries that will find the most relevant information.",
                                "output_key": "search_plan",
                            },
                            "input_mapping": {"prompt": "query"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": inet_search_exec_id,
                            "node_key": "search.execute",
                            "node_type": "tool",
                            "label": "Execute web search",
                            "description": "Run the planned web search queries and collect results.",
                            "executor_ref": "tool.web_search",
                            "config": {
                                "operation": "search",
                                "query_key": "search_plan",
                                "output_key": "search_results",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": inet_synthesize_id,
                            "node_key": "synthesize.results",
                            "node_type": "llm",
                            "label": "Synthesize search results",
                            "description": "Synthesize raw search results into a coherent research summary.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a research synthesizer. Given raw search results and the original query, produce a well-structured, cited summary answering the user's question.",
                                "output_key": "synthesis",
                            },
                            "input_mapping": {"prompt": "search_results", "context": "query"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": inet_artifact_id,
                            "node_key": "artifact.emit",
                            "node_type": "artifact",
                            "label": "Emit research artifact",
                            "description": "Emit the synthesized research as a durable artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Internet Research: {query}",
                                "body_template": "{synthesis}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by internet research workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": inet_terminal_id,
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
                        {"id": _seed_uuid("internet-research/edge/plan-to-search"), "from_node_id": inet_query_plan_id, "to_node_id": inet_search_exec_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Queries planned", "status": "active"},
                        {"id": _seed_uuid("internet-research/edge/search-to-synthesize"), "from_node_id": inet_search_exec_id, "to_node_id": inet_synthesize_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Results fetched", "status": "active"},
                        {"id": _seed_uuid("internet-research/edge/synthesize-to-artifact"), "from_node_id": inet_synthesize_id, "to_node_id": inet_artifact_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Synthesized", "status": "active"},
                        {"id": _seed_uuid("internet-research/edge/artifact-to-terminal"), "from_node_id": inet_artifact_id, "to_node_id": inet_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Artifact emitted", "status": "active"},
                    ],
                },
            },
        },
        # ─────────────────────────────────────────────────────────────────
        # 6. Internet Deep Research
        # ─────────────────────────────────────────────────────────────────
        {
            "slug": "internet-deep-research",
            "workflow": {
                "id": deep_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Internet Deep Research",
                "slug": "internet-deep-research",
                "description": "Decompose a complex question into sub-queries, fan out internet research workflows, join and reduce results, verify quality, and emit a comprehensive research artifact.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "curated_workflow",
                "template_metadata": _catalog_template_metadata(
                    "internet_deep_research", "llm", "fanout", "join", "reduce", "artifact",
                    recommended_use_cases=[
                        "Multi-faceted research questions",
                        "Comprehensive topic deep dives",
                        "Cross-source verification research",
                    ],
                    tags=["research", "internet", "deep-research"],
                ),
                "version": {
                    "entry_node_id": deep_decompose_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "sub_queries": {"type": "array", "items": {"type": "string"}},
                            "joined_results": {"type": "string"},
                            "reduced_synthesis": {"type": "string"},
                            "quality_assessment": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["query"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"query": {"type": "string"}},
                        "required": ["query"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "reduced_synthesis": {"type": "string"},
                            "quality_assessment": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Curated internet deep research workflow template.",
                    "nodes": [
                        {
                            "id": deep_decompose_id,
                            "node_key": "decompose.queries",
                            "node_type": "llm",
                            "label": "Decompose into sub-queries",
                            "description": "Use an LLM to break a complex question into independent sub-queries for parallel research.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a research strategist. Decompose the user's complex question into 3-5 independent sub-queries that together will cover the topic comprehensively. Return each sub-query as an array item.",
                                "output_key": "sub_queries",
                                "output_format": "json_array",
                            },
                            "input_mapping": {"prompt": "query"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": deep_fanout_id,
                            "node_key": "search.fanout",
                            "node_type": "fanout",
                            "label": "Fan out internet research",
                            "description": "Launch an internet-research child workflow for each sub-query.",
                            "executor_ref": "runtime.fanout",
                            "config": {
                                "delegation_mode": "fanout",
                                "child_workflow_id": str(inet_workflow_id),
                                "fanout_items_key": "sub_queries",
                                "join_group_id": "deep-research-branches",
                                "input_mapping": {"query": "item"},
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": deep_join_id,
                            "node_key": "search.join",
                            "node_type": "join",
                            "label": "Join research branches",
                            "description": "Collect all parallel research branch outputs.",
                            "executor_ref": "runtime.join",
                            "config": {"join_group_id": "deep-research-branches", "output_key": "joined_results"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": deep_reduce_id,
                            "node_key": "synthesize.reduce",
                            "node_type": "reduce",
                            "label": "Reduce into comprehensive synthesis",
                            "description": "Merge all branch research outputs into one unified synthesis.",
                            "executor_ref": "runtime.reduce",
                            "config": {"join_group_id": "deep-research-branches", "source_key": "joined_results", "output_key": "reduced_synthesis", "strategy": "concat_field", "field": "synthesis"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": deep_verify_id,
                            "node_key": "verify.quality",
                            "node_type": "llm",
                            "label": "Verify research quality",
                            "description": "LLM pass to verify completeness, accuracy, and identify gaps in the synthesized research.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a research quality reviewer. Assess the following research synthesis for completeness, accuracy, and coherence. Flag any gaps or unsupported claims. Produce a final quality-verified version.",
                                "output_key": "quality_assessment",
                            },
                            "input_mapping": {"prompt": "reduced_synthesis", "context": "query"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": deep_artifact_id,
                            "node_key": "artifact.emit",
                            "node_type": "artifact",
                            "label": "Emit deep research artifact",
                            "description": "Emit the verified deep research as a durable artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Deep Research: {query}",
                                "body_template": "{quality_assessment}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by internet deep research workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": deep_terminal_id,
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
                        {"id": _seed_uuid("internet-deep-research/edge/decompose-to-fanout"), "from_node_id": deep_decompose_id, "to_node_id": deep_fanout_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Decomposed", "status": "active"},
                        {"id": _seed_uuid("internet-deep-research/edge/fanout-to-join"), "from_node_id": deep_fanout_id, "to_node_id": deep_join_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Branches complete", "status": "active"},
                        {"id": _seed_uuid("internet-deep-research/edge/join-to-reduce"), "from_node_id": deep_join_id, "to_node_id": deep_reduce_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Joined", "status": "active"},
                        {"id": _seed_uuid("internet-deep-research/edge/reduce-to-verify"), "from_node_id": deep_reduce_id, "to_node_id": deep_verify_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Reduced", "status": "active"},
                        {"id": _seed_uuid("internet-deep-research/edge/verify-to-artifact"), "from_node_id": deep_verify_id, "to_node_id": deep_artifact_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Verified", "status": "active"},
                        {"id": _seed_uuid("internet-deep-research/edge/artifact-to-terminal"), "from_node_id": deep_artifact_id, "to_node_id": deep_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Artifact emitted", "status": "active"},
                    ],
                },
            },
        },
        # ─────────────────────────────────────────────────────────────────
        # 7. Exploratory Swarm
        # ─────────────────────────────────────────────────────────────────
        {
            "slug": "exploratory-swarm",
            "workflow": {
                "id": swarm_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Exploratory Swarm",
                "slug": "exploratory-swarm",
                "description": "Generate exploration directions, fan out explorer agents, join findings, and reduce into a discovery report.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "curated_workflow",
                "template_metadata": _catalog_template_metadata(
                    "exploratory_swarm", "llm", "fanout", "join", "reduce", "artifact",
                    recommended_use_cases=[
                        "Open-ended topic exploration",
                        "Brainstorming and idea generation",
                        "Divergent research across multiple angles",
                    ],
                    tags=["exploration", "discovery", "swarm"],
                ),
                "version": {
                    "entry_node_id": swarm_directions_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "topic": {"type": "string"},
                            "directions": {"type": "array", "items": {"type": "string"}},
                            "joined_explorations": {"type": "string"},
                            "discovery_report": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["topic"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"topic": {"type": "string"}},
                        "required": ["topic"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "discovery_report": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Curated exploratory swarm workflow template.",
                    "nodes": [
                        {
                            "id": swarm_directions_id,
                            "node_key": "generate.directions",
                            "node_type": "llm",
                            "label": "Generate exploration directions",
                            "description": "Use an LLM to brainstorm diverse exploration directions for the given topic.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a creative research director. Given a topic, generate 3-6 diverse exploration directions that cover different angles, perspectives, or sub-domains. Return each direction as an array item.",
                                "output_key": "directions",
                                "output_format": "json_array",
                            },
                            "input_mapping": {"prompt": "topic"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": swarm_fanout_id,
                            "node_key": "explore.fanout",
                            "node_type": "fanout",
                            "label": "Fan out explorers",
                            "description": "Launch a review-and-publish child workflow for each exploration direction.",
                            "executor_ref": "runtime.fanout",
                            "config": {
                                "delegation_mode": "fanout",
                                "child_workflow_id": str(review_workflow_id),
                                "fanout_items_key": "directions",
                                "join_group_id": "swarm-explorers",
                                "input_mapping": {"request": "item"},
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": swarm_join_id,
                            "node_key": "explore.join",
                            "node_type": "join",
                            "label": "Join explorer outputs",
                            "description": "Collect all exploration branch outputs.",
                            "executor_ref": "runtime.join",
                            "config": {"join_group_id": "swarm-explorers", "output_key": "joined_explorations"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": swarm_reduce_id,
                            "node_key": "synthesize.discoveries",
                            "node_type": "reduce",
                            "label": "Reduce into discovery report",
                            "description": "Reduce all exploration outputs into a unified discovery report.",
                            "executor_ref": "runtime.reduce",
                            "config": {"join_group_id": "swarm-explorers", "source_key": "joined_explorations", "output_key": "discovery_report", "strategy": "concat_field", "field": "review_text"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": swarm_artifact_id,
                            "node_key": "artifact.emit",
                            "node_type": "artifact",
                            "label": "Emit discovery artifact",
                            "description": "Emit the discovery report as a durable artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Exploratory Swarm: {topic}",
                                "body_template": "{discovery_report}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by exploratory swarm workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": swarm_terminal_id,
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
                        {"id": _seed_uuid("exploratory-swarm/edge/directions-to-fanout"), "from_node_id": swarm_directions_id, "to_node_id": swarm_fanout_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Directions generated", "status": "active"},
                        {"id": _seed_uuid("exploratory-swarm/edge/fanout-to-join"), "from_node_id": swarm_fanout_id, "to_node_id": swarm_join_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Branches complete", "status": "active"},
                        {"id": _seed_uuid("exploratory-swarm/edge/join-to-reduce"), "from_node_id": swarm_join_id, "to_node_id": swarm_reduce_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Joined", "status": "active"},
                        {"id": _seed_uuid("exploratory-swarm/edge/reduce-to-artifact"), "from_node_id": swarm_reduce_id, "to_node_id": swarm_artifact_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Reduced", "status": "active"},
                        {"id": _seed_uuid("exploratory-swarm/edge/artifact-to-terminal"), "from_node_id": swarm_artifact_id, "to_node_id": swarm_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Artifact emitted", "status": "active"},
                    ],
                },
            },
        },
        # ─────────────────────────────────────────────────────────────────
        # 8. Verify and Refine
        # ─────────────────────────────────────────────────────────────────
        {
            "slug": "verify-and-refine",
            "workflow": {
                "id": vr_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Verify and Refine",
                "slug": "verify-and-refine",
                "description": "Verify claims in content, identify gaps, refine the content, require approval, and emit a polished artifact.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "curated_workflow",
                "template_metadata": _catalog_template_metadata(
                    "verify_and_refine", "llm", "approval", "artifact",
                    recommended_use_cases=[
                        "Fact-checking and claim verification",
                        "Content quality improvement",
                        "Iterative refinement with human approval",
                    ],
                    tags=["verification", "refinement", "quality"],
                ),
                "version": {
                    "entry_node_id": vr_verify_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "content": {"type": "string"},
                            "verification_report": {"type": "string"},
                            "gap_analysis": {"type": "string"},
                            "refined_content": {"type": "string"},
                            "approval_status": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["content"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"content": {"type": "string"}},
                        "required": ["content"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "refined_content": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Curated verify and refine workflow template.",
                    "nodes": [
                        {
                            "id": vr_verify_id,
                            "node_key": "verify.claims",
                            "node_type": "llm",
                            "label": "Verify claims",
                            "description": "LLM pass to verify factual claims and flag unsupported assertions.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a fact-checker. Analyze the provided content for factual claims. For each claim, assess its accuracy and flag any that are unsupported, misleading, or incorrect. Produce a verification report.",
                                "output_key": "verification_report",
                            },
                            "input_mapping": {"prompt": "content"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": vr_gaps_id,
                            "node_key": "identify.gaps",
                            "node_type": "llm",
                            "label": "Identify gaps",
                            "description": "LLM pass to identify missing information, logical gaps, or areas needing expansion.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a content analyst. Review the original content and the verification report. Identify gaps in coverage, missing context, logical inconsistencies, and areas that need improvement. Produce a gap analysis.",
                                "output_key": "gap_analysis",
                            },
                            "input_mapping": {"prompt": "verification_report", "context": "content"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": vr_refine_id,
                            "node_key": "refine.content",
                            "node_type": "llm",
                            "label": "Refine content",
                            "description": "LLM pass to refine the original content based on verification and gap analysis.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are an expert editor. Refine the original content using the verification report and gap analysis. Fix inaccuracies, fill gaps, improve clarity, and produce a polished final version.",
                                "output_key": "refined_content",
                            },
                            "input_mapping": {"prompt": "gap_analysis", "context": "content"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": vr_approval_id,
                            "node_key": "approval.gate",
                            "node_type": "approval",
                            "label": "Approval gate",
                            "description": "Pause for human approval before publishing the refined content.",
                            "executor_ref": "approval.request",
                            "config": {"requested_action": "Publish refined content", "risk_category": "medium"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": vr_artifact_id,
                            "node_key": "artifact.emit",
                            "node_type": "artifact",
                            "label": "Emit refined artifact",
                            "description": "Emit the refined content as a durable artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Verified & Refined Content",
                                "body_template": "{refined_content}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by verify and refine workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": vr_terminal_id,
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
                        {"id": _seed_uuid("verify-and-refine/edge/verify-to-gaps"), "from_node_id": vr_verify_id, "to_node_id": vr_gaps_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Claims verified", "status": "active"},
                        {"id": _seed_uuid("verify-and-refine/edge/gaps-to-refine"), "from_node_id": vr_gaps_id, "to_node_id": vr_refine_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Gaps identified", "status": "active"},
                        {"id": _seed_uuid("verify-and-refine/edge/refine-to-approval"), "from_node_id": vr_refine_id, "to_node_id": vr_approval_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Content refined", "status": "active"},
                        {"id": _seed_uuid("verify-and-refine/edge/approval-to-artifact"), "from_node_id": vr_approval_id, "to_node_id": vr_artifact_id, "edge_type": "approved", "condition": {}, "priority": 100, "label": "Approved", "status": "active"},
                        {"id": _seed_uuid("verify-and-refine/edge/artifact-to-terminal"), "from_node_id": vr_artifact_id, "to_node_id": vr_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Artifact emitted", "status": "active"},
                    ],
                },
            },
        },
        # ─────────────────────────────────────────────────────────────────
        # 9. Multi-Source Synthesis
        # ─────────────────────────────────────────────────────────────────
        {
            "slug": "multi-source-synthesis",
            "workflow": {
                "id": mss_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Multi-Source Synthesis",
                "slug": "multi-source-synthesis",
                "description": "Fan out source analysis using review-and-publish child workflows, join results, reduce into a synthesized report, and emit an artifact.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "curated_workflow",
                "template_metadata": _catalog_template_metadata(
                    "multi_source_synthesis", "fanout", "join", "reduce", "artifact",
                    recommended_use_cases=[
                        "Comparing multiple documents or sources",
                        "Literature review synthesis",
                        "Cross-source data aggregation",
                    ],
                    tags=["synthesis", "multi-source", "analysis"],
                ),
                "version": {
                    "entry_node_id": mss_fanout_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "sources": {"type": "array", "items": {"type": "string"}},
                            "joined_analyses": {"type": "string"},
                            "synthesis_report": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["sources"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"sources": {"type": "array", "items": {"type": "string"}}},
                        "required": ["sources"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "synthesis_report": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Curated multi-source synthesis workflow template.",
                    "nodes": [
                        {
                            "id": mss_fanout_id,
                            "node_key": "analyze.fanout",
                            "node_type": "fanout",
                            "label": "Fan out source analysis",
                            "description": "Launch a review-and-publish child workflow for each source.",
                            "executor_ref": "runtime.fanout",
                            "config": {
                                "delegation_mode": "fanout",
                                "child_workflow_id": str(review_workflow_id),
                                "fanout_items_key": "sources",
                                "join_group_id": "source-analyses",
                                "input_mapping": {"request": "item"},
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": mss_join_id,
                            "node_key": "analyze.join",
                            "node_type": "join",
                            "label": "Join source analyses",
                            "description": "Collect all source analysis outputs.",
                            "executor_ref": "runtime.join",
                            "config": {"join_group_id": "source-analyses", "output_key": "joined_analyses"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": mss_reduce_id,
                            "node_key": "synthesize.reduce",
                            "node_type": "reduce",
                            "label": "Reduce into synthesis report",
                            "description": "Reduce all source analyses into a unified synthesis report.",
                            "executor_ref": "runtime.reduce",
                            "config": {"join_group_id": "source-analyses", "source_key": "joined_analyses", "output_key": "synthesis_report", "strategy": "concat_field", "field": "review_text"},
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": mss_artifact_id,
                            "node_key": "artifact.emit",
                            "node_type": "artifact",
                            "label": "Emit synthesis artifact",
                            "description": "Emit the synthesis report as a durable artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Multi-Source Synthesis Report",
                                "body_template": "{synthesis_report}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by multi-source synthesis workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": mss_terminal_id,
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
                        {"id": _seed_uuid("multi-source-synthesis/edge/fanout-to-join"), "from_node_id": mss_fanout_id, "to_node_id": mss_join_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Branches complete", "status": "active"},
                        {"id": _seed_uuid("multi-source-synthesis/edge/join-to-reduce"), "from_node_id": mss_join_id, "to_node_id": mss_reduce_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Joined", "status": "active"},
                        {"id": _seed_uuid("multi-source-synthesis/edge/reduce-to-artifact"), "from_node_id": mss_reduce_id, "to_node_id": mss_artifact_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Reduced", "status": "active"},
                        {"id": _seed_uuid("multi-source-synthesis/edge/artifact-to-terminal"), "from_node_id": mss_artifact_id, "to_node_id": mss_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Artifact emitted", "status": "active"},
                    ],
                },
            },
        },
        # ─────────────────────────────────────────────────────────────────
        # 10. Workspace Discovery
        # ─────────────────────────────────────────────────────────────────
        {
            "slug": "workspace-discovery",
            "workflow": {
                "id": wd_workflow_id,
                "workspace_id": resolved_workspace_id,
                "name": "Workspace Discovery",
                "slug": "workspace-discovery",
                "description": "Scan workspace knowledge, analyze patterns, generate insights, and emit a discovery artifact.",
                "status": "active",
                "is_system": True,
                "is_template": True,
                "template_kind": "curated_workflow",
                "template_metadata": _catalog_template_metadata(
                    "workspace_discovery", "tool", "llm", "artifact",
                    recommended_use_cases=[
                        "Workspace knowledge audits",
                        "Pattern identification across workspace content",
                        "Automated insight generation from existing data",
                    ],
                    tags=["workspace", "discovery", "insights"],
                ),
                "version": {
                    "entry_node_id": wd_scan_id,
                    "state_schema": {
                        "type": "object",
                        "properties": {
                            "scope": {"type": "string"},
                            "knowledge_dump": {"type": "string"},
                            "patterns": {"type": "string"},
                            "insights": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["scope"],
                    },
                    "default_input_schema": {
                        "type": "object",
                        "properties": {"scope": {"type": "string"}},
                        "required": ["scope"],
                    },
                    "default_output_schema": {
                        "type": "object",
                        "properties": {
                            "insights": {"type": "string"},
                            "artifact_ids": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "status": "active",
                    "change_note": "Curated workspace discovery workflow template.",
                    "nodes": [
                        {
                            "id": wd_scan_id,
                            "node_key": "scan.knowledge",
                            "node_type": "tool",
                            "label": "Scan workspace knowledge",
                            "description": "Scan and collect knowledge from the workspace based on the given scope.",
                            "executor_ref": "tool.workspace_scan",
                            "config": {
                                "operation": "scan",
                                "scope_key": "scope",
                                "output_key": "knowledge_dump",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": wd_patterns_id,
                            "node_key": "analyze.patterns",
                            "node_type": "llm",
                            "label": "Analyze patterns",
                            "description": "Use an LLM to identify recurring patterns, themes, and structures in the workspace knowledge.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are a pattern analyst. Review the workspace knowledge dump and identify recurring themes, patterns, relationships, and structural insights. Organize your findings clearly.",
                                "output_key": "patterns",
                            },
                            "input_mapping": {"prompt": "knowledge_dump", "context": "scope"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": wd_insights_id,
                            "node_key": "generate.insights",
                            "node_type": "llm",
                            "label": "Generate insights",
                            "description": "Synthesize patterns into actionable insights and recommendations.",
                            "executor_ref": "llm.chat_completion",
                            "config": {
                                "system_prompt": "You are an insights generator. Based on the identified patterns and the original scope, produce actionable insights, recommendations, and a summary of key findings for the workspace.",
                                "output_key": "insights",
                            },
                            "input_mapping": {"prompt": "patterns", "context": "scope"},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": wd_artifact_id,
                            "node_key": "artifact.emit",
                            "node_type": "artifact",
                            "label": "Emit discovery artifact",
                            "description": "Emit the workspace insights as a durable discovery artifact.",
                            "executor_ref": "artifact.emit",
                            "config": {
                                "artifact_type": "report",
                                "title_template": "Workspace Discovery: {scope}",
                                "body_template": "{insights}",
                                "artifact_state_key": "artifact_ids",
                                "change_note": "Created by workspace discovery workflow",
                            },
                            "input_mapping": {},
                            "output_mapping": {},
                            "status": "active",
                        },
                        {
                            "id": wd_terminal_id,
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
                        {"id": _seed_uuid("workspace-discovery/edge/scan-to-patterns"), "from_node_id": wd_scan_id, "to_node_id": wd_patterns_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Knowledge scanned", "status": "active"},
                        {"id": _seed_uuid("workspace-discovery/edge/patterns-to-insights"), "from_node_id": wd_patterns_id, "to_node_id": wd_insights_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Patterns found", "status": "active"},
                        {"id": _seed_uuid("workspace-discovery/edge/insights-to-artifact"), "from_node_id": wd_insights_id, "to_node_id": wd_artifact_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Insights generated", "status": "active"},
                        {"id": _seed_uuid("workspace-discovery/edge/artifact-to-terminal"), "from_node_id": wd_artifact_id, "to_node_id": wd_terminal_id, "edge_type": "success", "condition": {}, "priority": 100, "label": "Artifact emitted", "status": "active"},
                    ],
                },
            },
        },
    ])


async def seed_example_workflows(service: WorkflowSeeder, workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Seed the foundational workflow set through the workflow service."""

    created_workflows: list[dict[str, Any]] = []
    foundational_slugs = {
        "review-and-publish",
        "plan-execute-review",
        "map-reduce-research",
        "reviewer-council-reduce",
    }
    for blueprint in get_seed_workflow_blueprints(workspace_id):
        if blueprint["slug"] not in foundational_slugs:
            continue
        created_workflows.append(await service.create_workflow(blueprint["workflow"]))
    return created_workflows
