"""State transfer helpers for composite execution."""

from __future__ import annotations

from typing import Any


def _resolve_path(source: dict[str, Any], reference: Any, extra_context: dict[str, Any] | None = None) -> Any:
    if reference is None:
        return None
    if not isinstance(reference, str):
        return reference
    context = {**(extra_context or {}), **source}
    current: Any = context
    for part in reference.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        return None
    return current


def map_state_fields(
    source: dict[str, Any],
    mapping: dict[str, Any] | None = None,
    *,
    extra_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not mapping:
        return dict(source)

    payload: dict[str, Any] = {}
    for target_key, source_ref in mapping.items():
        if isinstance(source_ref, dict):
            value = _resolve_path(source, source_ref.get("from"), extra_context=extra_context)
            if value is None and "default" in source_ref:
                value = source_ref["default"]
        else:
            value = _resolve_path(source, source_ref, extra_context=extra_context)
        payload[target_key] = value
    return payload


def validate_required_fields(payload: dict[str, Any], schema: dict[str, Any] | None) -> None:
    required = list((schema or {}).get("required") or [])
    missing = [field for field in required if payload.get(field) is None]
    if missing:
        joined = ", ".join(missing)
        raise ValueError(f"Mapped payload missing required fields: {joined}")
