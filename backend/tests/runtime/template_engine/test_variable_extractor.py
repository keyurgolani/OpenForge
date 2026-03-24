"""Tests for the variable extractor."""

import pytest

from openforge.runtime.template_engine.variable_extractor import PromptVariableExtractor


class TestExtractFromTemplate:
    """Tests for extracting variables from template text alone."""

    def test_simple_extraction(self):
        """A plain {{name}} should produce a text parameter."""
        params = PromptVariableExtractor.extract("Hello {{name}}")
        assert len(params) == 1
        assert params[0].name == "name"
        assert params[0].type == "text"

    def test_typed_extraction(self):
        """A typed {{count::number}} should produce a number parameter."""
        params = PromptVariableExtractor.extract("Total: {{count::number}}")
        assert len(params) == 1
        assert params[0].name == "count"
        assert params[0].type == "number"

    def test_no_variables(self):
        """A template with no variables should return an empty list."""
        params = PromptVariableExtractor.extract("Hello world, no variables here.")
        assert params == []


class TestMergeWithMetadata:
    """Tests for merging template variables with parameter metadata."""

    def test_metadata_enriches_template_var(self):
        """Metadata label and description should be applied to the parameter."""
        template = "Research: {{topic}}"
        metadata = [
            {
                "name": "topic",
                "label": "Research Topic",
                "description": "The main topic to research",
            }
        ]
        params = PromptVariableExtractor.extract(template, parameters_metadata=metadata)
        assert len(params) == 1
        assert params[0].name == "topic"
        assert params[0].label == "Research Topic"
        assert params[0].description == "The main topic to research"

    def test_template_type_overrides_metadata(self):
        """Explicit type in template (::number) must win over metadata type."""
        template = "Count: {{count::number}}"
        metadata = [{"name": "count", "type": "text"}]
        params = PromptVariableExtractor.extract(template, parameters_metadata=metadata)
        assert len(params) == 1
        assert params[0].name == "count"
        assert params[0].type == "number"

    def test_metadata_only_param_included(self):
        """A param defined in metadata but not in the template body is included."""
        template = "Hello {{name}}"
        metadata = [
            {"name": "name"},
            {"name": "hidden_context", "type": "text", "label": "Hidden Context"},
        ]
        params = PromptVariableExtractor.extract(template, parameters_metadata=metadata)
        names = [p.name for p in params]
        assert "name" in names
        assert "hidden_context" in names
        hidden = next(p for p in params if p.name == "hidden_context")
        assert hidden.label == "Hidden Context"

    def test_default_and_options_from_metadata(self):
        """Enum options and a default value should be picked up from metadata."""
        template = "Priority: {{priority}}"
        metadata = [
            {
                "name": "priority",
                "type": "enum",
                "options": ["low", "medium", "high"],
                "default": "medium",
            }
        ]
        params = PromptVariableExtractor.extract(template, parameters_metadata=metadata)
        assert len(params) == 1
        p = params[0]
        assert p.name == "priority"
        assert p.type == "enum"
        assert p.options == ["low", "medium", "high"]
        assert p.default == "medium"

    def test_validation_rules_from_metadata(self):
        """Validation rules as list of dicts should be converted to ValidationRule objects."""
        template = "Name: {{username}}"
        metadata = [
            {
                "name": "username",
                "validation": [
                    {"type": "min_length", "value": 3},
                    {"type": "max_length", "value": 50, "message": "Too long"},
                ],
            }
        ]
        params = PromptVariableExtractor.extract(template, parameters_metadata=metadata)
        assert len(params) == 1
        p = params[0]
        assert p.validation is not None
        assert len(p.validation) == 2
        assert p.validation[0].type == "min_length"
        assert p.validation[0].value == 3
        assert p.validation[0].message is None
        assert p.validation[1].type == "max_length"
        assert p.validation[1].value == 50
        assert p.validation[1].message == "Too long"


class TestLabelGeneration:
    """Tests for automatic label generation from variable names."""

    def test_snake_case(self):
        """snake_case names should be converted to Title Case labels."""
        params = PromptVariableExtractor.extract("{{research_topic}}")
        assert len(params) == 1
        assert params[0].label == "Research Topic"

    def test_camel_case(self):
        """camelCase names should be converted to Title Case labels."""
        params = PromptVariableExtractor.extract("{{researchTopic}}")
        assert len(params) == 1
        assert params[0].label == "Research Topic"
