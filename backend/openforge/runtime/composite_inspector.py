"""Inspection helpers for composite execution state."""

from __future__ import annotations

from typing import Any


def summarize_branch_groups(branches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for branch in branches:
        join_group_id = branch.get("join_group_id")
        if not join_group_id:
            continue
        group = groups.setdefault(join_group_id, {"join_group_id": join_group_id, "branch_count": 0, "branches": []})
        group["branch_count"] += 1
        group["branches"].append(branch)
    return list(groups.values())
