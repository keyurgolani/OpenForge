"""Variable extractor — merges template variables with parameter metadata."""

from __future__ import annotations

from openforge.runtime.template_engine.parser import TemplateParser, _generate_label
from openforge.runtime.template_engine.types import (
    ParameterDefinition,
    ValidationRule,
    normalize_variable_type,
)


class PromptVariableExtractor:
    """Extracts and merges prompt variables from template text and metadata."""

    @staticmethod
    def extract(
        template: str,
        parameters_metadata: list[dict] | None = None,
    ) -> list[ParameterDefinition]:
        """Extract parameters from *template*, enriched with *parameters_metadata*.

        Merge rules:
        1. Parse the template to get base parameters and variables.
        2. Build a metadata lookup dict keyed by parameter name.
        3. For each template parameter, merge with metadata:
           - Explicit type in template (``{{var::type}}``) takes highest priority.
           - Otherwise, use normalized metadata type if present.
           - Otherwise, fall back to the template default ("text").
           - Enrich with metadata fields: label, description, required, default,
             options, validation.
        4. Append metadata-only params (defined in metadata but absent from
           the template body).
        5. Return the merged list.
        """
        result = TemplateParser.parse(template)

        # Build lookup: variable name → TemplateVariable (first occurrence)
        var_lookup: dict = {}
        for var in result.variables:
            if var.name not in var_lookup:
                var_lookup[var.name] = var

        # Build metadata lookup by name
        meta_lookup: dict[str, dict] = {}
        if parameters_metadata:
            for meta in parameters_metadata:
                name = meta.get("name")
                if name:
                    meta_lookup[name] = meta

        merged: list[ParameterDefinition] = []
        seen_names: set[str] = set()

        # Process template parameters first
        for param in result.parameters:
            seen_names.add(param.name)
            var = var_lookup.get(param.name)
            meta = meta_lookup.get(param.name, {})

            # Determine type: template explicit > metadata > template default
            if var and var.has_explicit_type:
                param_type = var.resolved_type
            elif "type" in meta:
                normalized = normalize_variable_type(meta["type"])
                param_type = normalized if normalized else var.resolved_type if var else "text"
            else:
                param_type = param.type  # template default

            # Build label
            label = meta.get("label") or param.label or _generate_label(param.name)

            # Build validation rules
            validation = _build_validation(meta.get("validation"))

            merged.append(
                ParameterDefinition(
                    name=param.name,
                    type=param_type,
                    label=label,
                    description=meta.get("description", param.description),
                    required=meta.get("required", param.required),
                    default=meta.get("default", param.default),
                    options=meta.get("options", param.options),
                    validation=validation,
                )
            )

        # Append metadata-only params (not found in template body)
        for name, meta in meta_lookup.items():
            if name in seen_names:
                continue
            raw_type = meta.get("type", "text")
            normalized = normalize_variable_type(raw_type)
            param_type = normalized if normalized else "text"

            validation = _build_validation(meta.get("validation"))

            merged.append(
                ParameterDefinition(
                    name=name,
                    type=param_type,
                    label=meta.get("label") or _generate_label(name),
                    description=meta.get("description", ""),
                    required=meta.get("required", True),
                    default=meta.get("default"),
                    options=meta.get("options"),
                    validation=validation,
                )
            )

        return merged


def _build_validation(
    raw: list[dict] | None,
) -> list[ValidationRule] | None:
    """Convert a list of raw validation dicts to ValidationRule objects."""
    if not raw:
        return None
    return [
        ValidationRule(
            type=rule["type"],
            value=rule["value"],
            message=rule.get("message"),
        )
        for rule in raw
    ]
