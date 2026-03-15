"""Merge and reduce helpers for composite execution.

Provides explicit merge strategies for child-to-parent state integration
and collection reduction with audit metadata per Phase 10 requirements.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("openforge.runtime.merge_engine")


# ---------------------------------------------------------------------------
# Supported merge strategies
# ---------------------------------------------------------------------------

SUPPORTED_MERGE_STRATEGIES = {
    "direct",
    "append",
    "artifact_refs",
    "evidence_refs",
    "first_non_null",
}

# ---------------------------------------------------------------------------
# Supported reduce strategies
# ---------------------------------------------------------------------------

SUPPORTED_REDUCE_STRATEGIES = {
    "collect",
    "count",
    "concat_field",
    "first_non_null",
    "latest",
    "majority_vote",
}


class MergeError(Exception):
    """Raised when a merge operation fails."""

    def __init__(self, message: str, *, code: str = "merge_failed", details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


# ---------------------------------------------------------------------------
# Child output merge
# ---------------------------------------------------------------------------


def merge_child_output(
    parent_state: dict[str, Any],
    child_output: dict[str, Any],
    output_mapping: dict[str, Any] | None = None,
    *,
    strategy: str | None = None,
    merge_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge child output into parent state using a declared strategy.

    Strategies:
    * ``direct`` -- map or merge child fields into parent (last write wins)
    * ``append`` -- append child values to parent lists
    * ``artifact_refs`` -- append artifact reference values to parent lists
    * ``evidence_refs`` -- append evidence reference values to parent lists
    * ``first_non_null`` -- only set parent fields that are currently None

    ``merge_metadata`` is an optional dict that will be tracked in
    ``__merge_audit__`` on the returned state for inspection.
    """
    merged = dict(parent_state)
    mapping = output_mapping or {}
    normalized_strategy = strategy or "direct"

    if normalized_strategy not in SUPPORTED_MERGE_STRATEGIES:
        raise MergeError(
            f"Unsupported merge strategy: {normalized_strategy}",
            code="unsupported_merge_strategy",
            details={"strategy": normalized_strategy, "supported": sorted(SUPPORTED_MERGE_STRATEGIES)},
        )

    if normalized_strategy == "direct":
        if not mapping:
            merged.update(child_output)
        else:
            for target_key, source_key in mapping.items():
                merged[target_key] = child_output.get(source_key)

    elif normalized_strategy in {"append", "artifact_refs", "evidence_refs"}:
        for target_key, source_key in mapping.items():
            merged.setdefault(target_key, [])
            value = child_output.get(source_key)
            if value is None:
                continue
            if isinstance(value, list):
                merged[target_key].extend(value)
            else:
                merged[target_key].append(value)

    elif normalized_strategy == "first_non_null":
        if not mapping:
            for key, value in child_output.items():
                if merged.get(key) is None:
                    merged[key] = value
        else:
            for target_key, source_key in mapping.items():
                if merged.get(target_key) is None:
                    merged[target_key] = child_output.get(source_key)

    # Track merge audit metadata
    if merge_metadata:
        audit = list(merged.get("__merge_audit__") or [])
        audit.append({
            "strategy": normalized_strategy,
            **merge_metadata,
        })
        merged["__merge_audit__"] = audit

    return merged


# ---------------------------------------------------------------------------
# Collection reduction
# ---------------------------------------------------------------------------


def reduce_collection(
    items: list[dict[str, Any]],
    *,
    strategy: str,
    field: str | None = None,
    separator: str = "\n",
) -> Any:
    """Reduce a list of branch outputs to a single value.

    Strategies:
    * ``collect`` -- return list as-is
    * ``count`` -- return length
    * ``concat_field`` -- join field values with separator
    * ``first_non_null`` -- return first non-null field value
    * ``latest`` -- return last item (latest branch completion)
    * ``majority_vote`` -- return most common field value
    """
    if strategy not in SUPPORTED_REDUCE_STRATEGIES:
        raise MergeError(
            f"Unsupported reducer strategy: {strategy}",
            code="unsupported_reduce_strategy",
            details={"strategy": strategy, "supported": sorted(SUPPORTED_REDUCE_STRATEGIES)},
        )

    if strategy == "collect":
        return list(items)

    if strategy == "count":
        return len(items)

    if strategy == "concat_field":
        values = []
        for item in items:
            value = item.get(field or "")
            if value:
                values.append(str(value))
        return separator.join(values)

    if strategy == "first_non_null":
        for item in items:
            value = item.get(field or "")
            if value is not None:
                return value
        return None

    if strategy == "latest":
        if not items:
            return None
        return items[-1]

    if strategy == "majority_vote":
        if not items or not field:
            return None
        vote_counts: dict[str, int] = {}
        for item in items:
            value = item.get(field)
            if value is not None:
                key = str(value)
                vote_counts[key] = vote_counts.get(key, 0) + 1
        if not vote_counts:
            return None
        winner = max(vote_counts, key=lambda k: vote_counts[k])
        return winner

    raise MergeError(f"Unsupported reducer strategy: {strategy}")


# ---------------------------------------------------------------------------
# Merge audit helpers
# ---------------------------------------------------------------------------


def build_merge_metadata(
    *,
    child_run_id: str | None = None,
    branch_key: str | None = None,
    branch_index: int | None = None,
    delegation_mode: str | None = None,
    node_key: str | None = None,
) -> dict[str, Any]:
    """Build a merge metadata entry for audit tracking."""
    meta: dict[str, Any] = {}
    if child_run_id:
        meta["child_run_id"] = child_run_id
    if branch_key:
        meta["branch_key"] = branch_key
    if branch_index is not None:
        meta["branch_index"] = branch_index
    if delegation_mode:
        meta["delegation_mode"] = delegation_mode
    if node_key:
        meta["node_key"] = node_key
    return meta
