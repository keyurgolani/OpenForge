"""OpenForge Template Engine — ported from PromptForge.

Public API:
    parse(template) -> TemplateParseResult
    render(template, context) -> TemplateRenderResult
    extract_parameters(template, metadata?) -> list[ParameterDefinition]
    function_catalog() -> list[dict]
"""

from .functions import FunctionRegistry
from .parser import TemplateParser
from .renderer import TemplateRenderer
from .types import (
    ParameterDefinition,
    TemplateParseResult,
    TemplateRenderResult,
    TemplateVariable,
    ValidationRule,
    VariableType,
)
from .variable_extractor import PromptVariableExtractor

_registry = FunctionRegistry()


def parse(template: str) -> TemplateParseResult:
    """Parse a template and extract variables, validate syntax."""
    return TemplateParser.parse(template)


def render(template: str, context: dict) -> TemplateRenderResult:
    """Render a template with the given context."""
    return TemplateRenderer.render(template, context)


def extract_parameters(
    template: str,
    parameters_metadata: list[dict] | None = None,
) -> list[ParameterDefinition]:
    """Extract parameter definitions from template + optional metadata."""
    return PromptVariableExtractor.extract(template, parameters_metadata)


def function_catalog() -> list[dict[str, str]]:
    """Get the full function catalog for editor reference."""
    return _registry.catalog()


__all__ = [
    "extract_parameters",
    "function_catalog",
    "parse",
    "render",
    "FunctionRegistry",
    "ParameterDefinition",
    "PromptVariableExtractor",
    "TemplateParseResult",
    "TemplateParser",
    "TemplateRenderer",
    "TemplateRenderResult",
    "TemplateVariable",
    "ValidationRule",
    "VariableType",
]
