"""Template parser — extracts variables, validates syntax, generates parameter definitions."""

from __future__ import annotations

import re

from openforge.runtime.template_engine.types import (
    ParameterDefinition,
    TemplateParseResult,
    TemplateVariable,
    parse_type_indicator,
)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w.-]*)([\s\S]*?)\}\}")
_COMMENT_RE = re.compile(r"\{#[\s\S]*?#\}")
_IF_RE = re.compile(r"\{%\s*if\s+")
_ENDIF_RE = re.compile(r"\{%\s*endif\s*%\}")
_FOR_RE = re.compile(r"\{%\s*for\s+(\w+)\s+in\s+(\w[\w.]*)\s*%\}")
_ENDFOR_RE = re.compile(r"\{%\s*endfor\s*%\}")
_EMPTY_VAR_RE = re.compile(r"\{\{\s*\}\}")
_UNCLOSED_VAR_RE = re.compile(r"\{\{[^}]*$", re.MULTILINE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_label(name: str) -> str:
    """Convert ``snake_case``, ``dot.path``, and ``camelCase`` to Title Case."""
    # Split on underscores and dots first
    parts = re.split(r"[_.]", name)
    # Then split camelCase within each part
    expanded: list[str] = []
    for part in parts:
        split = re.sub(r"([a-z])([A-Z])", r"\1 \2", part)
        expanded.extend(split.split())
    return " ".join(word.capitalize() for word in expanded if word)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

class TemplateParser:
    """Static-method parser that extracts variables and validates templates."""

    @staticmethod
    def parse(template: str) -> TemplateParseResult:
        """Parse *template* and return a :class:`TemplateParseResult`."""
        errors: list[str] = []
        warnings: list[str] = []

        # 1. Strip comments
        stripped = _COMMENT_RE.sub("", template)

        # 2. Validate syntax -------------------------------------------------
        # Empty variables {{ }}
        if _EMPTY_VAR_RE.search(stripped):
            errors.append("Empty variable expression found: {{ }}")

        # Unclosed {{
        if _UNCLOSED_VAR_RE.search(stripped):
            errors.append("Unclosed variable expression found")

        # Unmatched if / endif
        if_count = len(_IF_RE.findall(stripped))
        endif_count = len(_ENDIF_RE.findall(stripped))
        if if_count != endif_count:
            errors.append(
                f"Unmatched if/endif blocks: {if_count} if vs {endif_count} endif"
            )

        # Unmatched for / endfor
        for_count = len(_FOR_RE.findall(stripped))
        endfor_count = len(_ENDFOR_RE.findall(stripped))
        if for_count != endfor_count:
            errors.append(
                f"Unmatched for/endfor blocks: {for_count} for vs {endfor_count} endfor"
            )

        # 3. Collect loop iterators so we can skip them ----------------------
        loop_iterators: set[str] = set()
        for m in _FOR_RE.finditer(stripped):
            loop_iterators.add(m.group(1))

        # 4. Extract variables -----------------------------------------------
        variables: list[TemplateVariable] = []
        for m in _VARIABLE_RE.finditer(stripped):
            name = m.group(1)
            suffix = m.group(2).strip()

            # Skip function calls (suffix starts with '(')
            if suffix.startswith("("):
                continue

            # Skip loop iterators
            if name in loop_iterators:
                continue

            # Determine position (line, column)
            start = m.start()
            line = stripped[:start].count("\n") + 1
            last_nl = stripped.rfind("\n", 0, start)
            col = start - last_nl  # 1-based column

            type_info = parse_type_indicator(suffix) if suffix else None
            has_explicit = type_info is not None
            resolved_type = type_info["type"] if type_info else "text"
            enum_options = type_info["enum_options"] if type_info else []

            variables.append(
                TemplateVariable(
                    name=name,
                    type_indicator=suffix if suffix else None,
                    has_explicit_type=has_explicit,
                    resolved_type=resolved_type,
                    enum_options=enum_options,
                    position={"start": start, "end": m.end(), "line": line, "column": col},
                )
            )

        # 5. Generate deduplicated parameters --------------------------------
        seen: dict[str, ParameterDefinition] = {}
        for var in variables:
            if var.name not in seen:
                seen[var.name] = ParameterDefinition(
                    name=var.name,
                    type=var.resolved_type,
                    label=_generate_label(var.name),
                    options=var.enum_options if var.enum_options else None,
                )
        parameters = list(seen.values())

        return TemplateParseResult(
            is_valid=len(errors) == 0,
            variables=variables,
            parameters=parameters,
            errors=errors,
            warnings=warnings,
        )
