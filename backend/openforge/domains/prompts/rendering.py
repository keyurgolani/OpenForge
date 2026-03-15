"""Typed prompt rendering helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from string import Formatter
from typing import Any, Iterable

from .types import RenderedPrompt, PromptRenderError, PromptRenderMetadata, PromptRenderValidationError


SUPPORTED_SCHEMA_TYPES = {
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "object": dict,
    "array": list,
}


def _schema_for(definition: Any, version: Any) -> dict[str, Any]:
    return getattr(version, "variable_schema", None) or getattr(definition, "variable_schema", None) or {}


def _declared_keys(schema: dict[str, Any]) -> set[str]:
    return set(schema.keys())


def _required_keys(schema: dict[str, Any]) -> set[str]:
    return {
        key
        for key, spec in schema.items()
        if isinstance(spec, dict) and spec.get("required", True)
    }


def _expected_type(schema_spec: dict[str, Any]) -> str:
    return str(schema_spec.get("type") or "string")


def _validate_variables(schema: dict[str, Any], variables: dict[str, Any], *, strict: bool = True) -> None:
    declared = _declared_keys(schema)
    required = _required_keys(schema)

    missing = sorted(required.difference(variables.keys()))
    if missing:
        raise PromptRenderValidationError(
            "missing_variables",
            "Prompt render failed because required variables were missing.",
            details={"missing": missing},
        )

    if strict:
        extra = sorted(set(variables.keys()).difference(declared))
        if extra:
            raise PromptRenderValidationError(
                "extra_variables",
                "Prompt render failed because undeclared variables were supplied.",
                details={"extra": extra},
            )

    invalid: dict[str, dict[str, str]] = {}
    for key, value in variables.items():
        if key not in schema:
            continue
        expected = _expected_type(schema[key])
        expected_python = SUPPORTED_SCHEMA_TYPES.get(expected)
        if expected_python is None:
            raise PromptRenderValidationError(
                "unsupported_variable_type",
                f"Prompt render failed because variable '{key}' uses unsupported schema type '{expected}'.",
                details={"variable": key, "expected": expected},
            )
        if not isinstance(value, expected_python):
            invalid[key] = {"expected": expected, "received": type(value).__name__}

    if invalid:
        raise PromptRenderValidationError(
            "invalid_variable_type",
            "Prompt render failed because one or more variables had the wrong type.",
            details=invalid,
        )


def select_prompt_version(versions: Iterable[Any], requested_version: int | None = None) -> Any:
    version_list = list(versions)
    if requested_version is not None:
        for version in version_list:
            if getattr(version, "version", None) == requested_version:
                return version
        raise PromptRenderError(
            "prompt_version_not_found",
            f"Prompt version {requested_version} was not found.",
            details={"requested_version": requested_version},
        )

    active_versions = [version for version in version_list if getattr(version, "status", None) == "active"]
    if active_versions:
        return sorted(active_versions, key=lambda item: getattr(item, "version", 0), reverse=True)[0]
    if version_list:
        return sorted(version_list, key=lambda item: getattr(item, "version", 0), reverse=True)[0]
    raise PromptRenderError("prompt_version_not_found", "No prompt versions are available for rendering.")


def render_prompt_version(definition: Any, version: Any, variables: dict[str, Any], *, strict: bool = True) -> RenderedPrompt:
    schema = _schema_for(definition, version)
    _validate_variables(schema, variables, strict=strict)

    template = getattr(version, "template", "")
    formatter = Formatter()
    referenced_fields = [field_name for _, field_name, _, _ in formatter.parse(template) if field_name]
    missing_from_template = sorted(set(referenced_fields).difference(variables.keys()))
    if missing_from_template:
        raise PromptRenderValidationError(
            "missing_variables",
            "Prompt render failed because required placeholders were missing from the variable payload.",
            details={"missing": missing_from_template},
        )

    try:
        content = template.format_map(variables)
    except KeyError as exc:  # pragma: no cover - the explicit validation above should catch this
        raise PromptRenderValidationError(
            "missing_variables",
            "Prompt render failed because a placeholder variable was missing.",
            details={"missing": [str(exc)]},
        ) from exc

    metadata = PromptRenderMetadata(
        prompt_id=str(getattr(definition, "id")),
        prompt_version=int(getattr(version, "version", 0)),
        owner_type=str(getattr(definition, "owner_type", "system")),
        owner_id=getattr(definition, "owner_id", None),
        rendered_at=datetime.now(timezone.utc),
        variable_keys=sorted(variables.keys()),
    )
    return RenderedPrompt(content=content, metadata=metadata)
