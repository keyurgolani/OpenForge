"""Merge and reduce helpers for composite execution."""

from __future__ import annotations

from typing import Any


def merge_child_output(
    parent_state: dict[str, Any],
    child_output: dict[str, Any],
    output_mapping: dict[str, Any] | None = None,
    *,
    strategy: str | None = None,
) -> dict[str, Any]:
    merged = dict(parent_state)
    mapping = output_mapping or {}
    normalized_strategy = strategy or "direct"

    if normalized_strategy == "direct":
        if not mapping:
            merged.update(child_output)
            return merged
        for target_key, source_key in mapping.items():
            merged[target_key] = child_output.get(source_key)
        return merged

    if normalized_strategy in {"append", "artifact_refs", "evidence_refs"}:
        for target_key, source_key in mapping.items():
            merged.setdefault(target_key, [])
            value = child_output.get(source_key)
            if value is None:
                continue
            if isinstance(value, list):
                merged[target_key].extend(value)
            else:
                merged[target_key].append(value)
        return merged

    raise ValueError(f"Unsupported merge strategy: {normalized_strategy}")


def reduce_collection(
    items: list[dict[str, Any]],
    *,
    strategy: str,
    field: str | None = None,
    separator: str = "\n",
) -> Any:
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

    raise ValueError(f"Unsupported reducer strategy: {strategy}")
