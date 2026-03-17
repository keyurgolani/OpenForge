"""State transfer helpers for composite execution.

Provides explicit, validated parent-to-child state mapping with support for
conflict detection and schema validation for composite workflow execution.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("openforge.runtime.state_transfer")


class StateMappingError(Exception):
    """Raised when state mapping or validation fails."""

    def __init__(self, message: str, *, code: str = "state_mapping_failed", details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


class MergeConflictError(Exception):
    """Raised when conflicting state merges are detected."""

    def __init__(self, message: str, conflicts: list[dict[str, Any]]) -> None:
        super().__init__(message)
        self.conflicts = conflicts


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------


def _resolve_path(source: dict[str, Any], reference: Any, extra_context: dict[str, Any] | None = None) -> Any:
    """Resolve a dot-notation path against a state dict.

    Supports paths like ``"parent.child.field"`` and extra_context merging
    for fanout item injection.
    """
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


# ---------------------------------------------------------------------------
# State mapping
# ---------------------------------------------------------------------------


def map_state_fields(
    source: dict[str, Any],
    mapping: dict[str, Any] | None = None,
    *,
    extra_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Map source state fields to child input using a declared mapping.

    Each mapping entry can be:
    * a string -- interpreted as a dot-notation path into ``source``
    * a dict with ``"from"`` and optional ``"default"`` -- structured reference
    * any other value -- used as a literal constant

    Returns the mapped payload dictionary.
    """
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


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def validate_required_fields(payload: dict[str, Any], schema: dict[str, Any] | None) -> None:
    """Validate that mapped payload contains all required fields.

    ``schema`` follows a minimal JSON-schema-like structure with ``required``
    and ``properties`` keys.

    Raises ``StateMappingError`` if validation fails.
    """
    if not schema:
        return

    required = list(schema.get("required") or [])
    missing = [field for field in required if payload.get(field) is None]
    if missing:
        raise StateMappingError(
            f"Mapped payload missing required fields: {', '.join(missing)}",
            code="schema_validation_failed",
            details={"missing_fields": missing},
        )

    # Type validation for declared properties
    properties = schema.get("properties") or {}
    type_errors: list[str] = []
    for field_name, field_schema in properties.items():
        value = payload.get(field_name)
        if value is None:
            continue  # None values checked by required above
        expected_type = field_schema.get("type")
        if expected_type and not _check_type(value, expected_type):
            type_errors.append(
                f"Field '{field_name}' expected type '{expected_type}', got '{type(value).__name__}'"
            )

    if type_errors:
        raise StateMappingError(
            f"Schema type errors: {'; '.join(type_errors)}",
            code="schema_validation_failed",
            details={"type_errors": type_errors},
        )


def _check_type(value: Any, expected: str) -> bool:
    """Check if a value matches a JSON schema type string."""
    type_map = {
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
        "array": list,
        "object": dict,
    }
    expected_types = type_map.get(expected)
    if expected_types is None:
        return True  # Unknown type - pass
    return isinstance(value, expected_types)


# ---------------------------------------------------------------------------
# Output validation
# ---------------------------------------------------------------------------


def validate_child_output(
    output: dict[str, Any],
    output_schema: dict[str, Any] | None = None,
    *,
    strict: bool = False,
) -> list[str]:
    """Validate child output before merging into parent state.

    Returns a list of warnings. If ``strict`` is True, raises
    ``StateMappingError`` on the first validation failure.
    """
    if not output_schema:
        return []

    warnings: list[str] = []

    # Check required output fields
    required = list(output_schema.get("required") or [])
    missing = [field for field in required if field not in output or output[field] is None]
    if missing:
        msg = f"Child output missing required fields: {', '.join(missing)}"
        if strict:
            raise StateMappingError(msg, code="child_output_validation_failed", details={"missing": missing})
        warnings.append(msg)

    # Check type mismatches
    properties = output_schema.get("properties") or {}
    for field_name, field_schema in properties.items():
        value = output.get(field_name)
        if value is None:
            continue
        expected_type = field_schema.get("type")
        if expected_type and not _check_type(value, expected_type):
            msg = f"Child output field '{field_name}' has wrong type: expected '{expected_type}', got '{type(value).__name__}'"
            if strict:
                raise StateMappingError(msg, code="child_output_validation_failed")
            warnings.append(msg)

    return warnings


# ---------------------------------------------------------------------------
# Merge conflict detection
# ---------------------------------------------------------------------------


def detect_merge_conflicts(
    parent_state: dict[str, Any],
    child_outputs: list[dict[str, Any]],
    output_mapping: dict[str, Any] | None = None,
    *,
    strategy: str = "direct",
) -> list[dict[str, Any]]:
    """Detect potential conflicts when merging multiple child outputs.

    Only relevant for ``direct`` merge strategy where multiple children
    write to the same target key with different values.

    Returns a list of conflict descriptors.
    """
    if strategy != "direct" or not output_mapping:
        return []

    conflicts: list[dict[str, Any]] = []
    seen_values: dict[str, list[tuple[int, Any]]] = {}

    for idx, output in enumerate(child_outputs):
        for target_key, source_key in output_mapping.items():
            value = output.get(source_key) if isinstance(source_key, str) else source_key
            seen_values.setdefault(target_key, []).append((idx, value))

    for target_key, entries in seen_values.items():
        if len(entries) <= 1:
            continue
        distinct_values = set()
        for _, val in entries:
            try:
                distinct_values.add(str(val))
            except Exception:
                distinct_values.add(id(val))
        if len(distinct_values) > 1:
            conflicts.append({
                "target_key": target_key,
                "branch_values": [{"branch_index": idx, "value": val} for idx, val in entries],
                "resolution": "last_write_wins",
            })

    return conflicts


def validate_merge_safety(
    parent_state: dict[str, Any],
    child_output: dict[str, Any],
    output_mapping: dict[str, Any] | None = None,
    *,
    strategy: str = "direct",
    protected_keys: set[str] | None = None,
) -> list[str]:
    """Check for unsafe merge operations.

    Protected keys (like internal runtime state) should not be overwritten
    by child output.

    Returns a list of warnings.
    """
    warnings: list[str] = []
    _protected = protected_keys or {"__branch_groups__", "__internal__"}

    if strategy == "direct" and not output_mapping:
        # Unguarded direct merge - check for protected key overwrites
        for key in child_output:
            if key in _protected:
                warnings.append(f"Child output would overwrite protected key '{key}'")

    if output_mapping:
        for target_key in output_mapping:
            if target_key in _protected:
                warnings.append(f"Output mapping targets protected key '{target_key}'")

    return warnings
