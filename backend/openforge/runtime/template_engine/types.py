"""Type definitions for the OpenForge template engine."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

VariableType = Literal["text", "textarea", "number", "boolean", "enum"]

_CANONICAL_TYPES: set[str] = {"text", "textarea", "number", "boolean", "enum"}

_TYPE_ALIASES: dict[str, VariableType] = {
    # text aliases
    "string": "text",
    "str": "text",
    # textarea aliases
    "longtext": "textarea",
    "long_text": "textarea",
    # number aliases
    "numeric": "number",
    "integer": "number",
    "float": "number",
    "int": "number",
    # boolean aliases
    "bool": "boolean",
    # enum aliases
    "select": "enum",
    "multiselect": "enum",
}


def normalize_variable_type(value: str) -> VariableType | None:
    """Normalize a variable type string to its canonical VariableType.

    Handles canonical types, aliases, and case-insensitive matching.
    Returns None for unrecognised values.
    """
    if not value:
        return None
    lowered = value.lower().strip()
    if lowered in _CANONICAL_TYPES:
        return lowered  # type: ignore[return-value]
    return _TYPE_ALIASES.get(lowered)


def normalize_enum_options(value: Any) -> list[str]:
    """Normalize enum options from various input formats.

    Accepts:
    - list of strings (deduplicates and strips whitespace)
    - CSV string like ``"a, b, c"``
    - Bracket syntax like ``"[opt1, opt2]"``
    - None or empty inputs (returns [])
    """
    if value is None:
        return []

    if isinstance(value, list):
        seen: set[str] = set()
        result: list[str] = []
        for item in value:
            stripped = str(item).strip()
            if stripped and stripped not in seen:
                seen.add(stripped)
                result.append(stripped)
        return result

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        # Strip surrounding brackets if present
        if text.startswith("[") and text.endswith("]"):
            text = text[1:-1]
        parts = [p.strip() for p in text.split(",")]
        # Deduplicate while preserving order, skip empty strings
        seen_s: set[str] = set()
        result_s: list[str] = []
        for p in parts:
            if p and p not in seen_s:
                seen_s.add(p)
                result_s.append(p)
        return result_s

    return []


def parse_type_indicator(suffix: str) -> dict | None:
    """Parse a type indicator suffix like ``::text`` or ``::[low, medium, high]``.

    Returns a dict with ``type`` (VariableType) and ``enum_options`` (list[str]),
    or None if the suffix does not match the ``::`` prefix pattern.
    """
    if not suffix or not suffix.startswith("::"):
        return None

    body = suffix[2:].strip()
    if not body:
        return None

    # Bracket syntax implies enum
    if body.startswith("[") and body.endswith("]"):
        options = normalize_enum_options(body)
        return {"type": "enum", "enum_options": options}

    # Plain type name
    resolved = normalize_variable_type(body)
    if resolved is not None:
        return {"type": resolved, "enum_options": []}

    return None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ValidationRule(BaseModel):
    """A single validation rule for a template parameter."""

    type: str
    value: Any
    message: Optional[str] = None


class ParameterDefinition(BaseModel):
    """Definition of a template parameter (user-facing input)."""

    name: str
    type: VariableType
    label: str
    description: Optional[str] = None
    required: bool = True
    default: Optional[Any] = None
    options: Optional[list[str]] = None
    validation: Optional[list[ValidationRule]] = None


class TemplateVariable(BaseModel):
    """A variable discovered inside a template string."""

    name: str
    type_indicator: Optional[str] = None
    has_explicit_type: bool = False
    resolved_type: str = "text"
    enum_options: list[str] = Field(default_factory=list)
    position: Optional[dict[str, int]] = None  # {start, end, line, column}


class TemplateParseResult(BaseModel):
    """Result of parsing a template string."""

    is_valid: bool = True
    variables: list[TemplateVariable] = Field(default_factory=list)
    parameters: list[ParameterDefinition] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class TemplateRenderResult(BaseModel):
    """Result of rendering a template with variable values."""

    output: str = ""
    variables_used: list[str] = Field(default_factory=list)
    functions_used: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
