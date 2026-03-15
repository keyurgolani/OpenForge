"""Inspection helpers for composite execution state.

Provides structured summaries of branch groups, delegation history,
and merge outcomes for the composite debug API.
"""

from __future__ import annotations

from typing import Any


def summarize_branch_groups(branches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group branches by join_group_id with status summaries."""
    groups: dict[str, dict[str, Any]] = {}
    for branch in branches:
        join_group_id = branch.get("join_group_id")
        if not join_group_id:
            continue
        group = groups.setdefault(
            join_group_id,
            {
                "join_group_id": join_group_id,
                "branch_count": 0,
                "completed": 0,
                "failed": 0,
                "interrupted": 0,
                "pending": 0,
                "branches": [],
            },
        )
        group["branch_count"] += 1
        status = branch.get("status", "pending")
        if status == "completed":
            group["completed"] += 1
        elif status == "failed":
            group["failed"] += 1
        elif status in {"waiting_approval", "interrupted"}:
            group["interrupted"] += 1
        else:
            group["pending"] += 1
        group["branches"].append(branch)
    return list(groups.values())


def summarize_delegation_history(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build a delegation history from child run records."""
    history: list[dict[str, Any]] = []
    for run in runs:
        entry: dict[str, Any] = {
            "run_id": run.get("id"),
            "delegation_mode": run.get("delegation_mode"),
            "status": run.get("status"),
        }
        if run.get("merge_strategy"):
            entry["merge_strategy"] = run["merge_strategy"]
        if run.get("join_group_id"):
            entry["join_group_id"] = run["join_group_id"]
        if run.get("branch_key"):
            entry["branch_key"] = run["branch_key"]
        if run.get("branch_index") is not None:
            entry["branch_index"] = run["branch_index"]
        if run.get("handoff_reason"):
            entry["handoff_reason"] = run["handoff_reason"]
        meta = run.get("composite_metadata") or {}
        if meta.get("origin_node_key"):
            entry["origin_node_key"] = meta["origin_node_key"]
        if meta.get("failure_mode"):
            entry["failure_mode"] = meta["failure_mode"]
        if meta.get("retry_counts"):
            entry["retry_counts"] = meta["retry_counts"]
        history.append(entry)
    return history


def summarize_merge_outcomes(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract merge audit trail from state for debugging."""
    return list(state.get("__merge_audit__") or [])
