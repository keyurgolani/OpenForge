"""Tests for the template parser."""

import pytest

from openforge.runtime.template_engine.parser import TemplateParser


class TestVariableExtraction:
    """Tests for extracting variables from templates."""

    def test_simple_variable(self):
        result = TemplateParser.parse("Hello {{name}}")
        assert result.is_valid
        assert len(result.variables) == 1
        assert result.variables[0].name == "name"
        assert result.variables[0].resolved_type == "text"

    def test_typed_variable(self):
        result = TemplateParser.parse("Count: {{count::number}}")
        assert result.is_valid
        assert len(result.variables) == 1
        assert result.variables[0].name == "count"
        assert result.variables[0].resolved_type == "number"

    def test_enum_variable(self):
        result = TemplateParser.parse("Priority: {{priority::[low,med,high]}}")
        assert result.is_valid
        assert len(result.variables) == 1
        var = result.variables[0]
        assert var.name == "priority"
        assert var.resolved_type == "enum"
        assert var.enum_options == ["low", "med", "high"]

    def test_multiple_variables(self):
        result = TemplateParser.parse("{{first}} and {{second}}")
        assert result.is_valid
        assert len(result.variables) == 2
        names = [v.name for v in result.variables]
        assert "first" in names
        assert "second" in names

    def test_duplicate_deduplicated(self):
        result = TemplateParser.parse("{{name}} is {{name}}")
        assert result.is_valid
        assert len(result.variables) == 2  # variables list has all occurrences
        # but parameters should be deduplicated
        assert len(result.parameters) == 1
        assert result.parameters[0].name == "name"

    def test_no_variables(self):
        result = TemplateParser.parse("Hello world, no variables here.")
        assert result.is_valid
        assert len(result.variables) == 0
        assert len(result.parameters) == 0

    def test_dotted_path(self):
        result = TemplateParser.parse("Hello {{user.name}}")
        assert result.is_valid
        assert len(result.variables) == 1
        assert result.variables[0].name == "user.name"

    def test_variable_with_spaces(self):
        result = TemplateParser.parse("Hello {{ name }}")
        assert result.is_valid
        assert len(result.variables) == 1
        assert result.variables[0].name == "name"


class TestConditionalExtraction:
    """Tests for conditional block parsing."""

    def test_simple_if(self):
        template = "{% if show %}visible{% endif %}"
        result = TemplateParser.parse(template)
        assert result.is_valid

    def test_if_else(self):
        template = "{% if show %}yes{% else %}no{% endif %}"
        result = TemplateParser.parse(template)
        assert result.is_valid

    def test_unclosed_if(self):
        template = "{% if show %}visible"
        result = TemplateParser.parse(template)
        assert not result.is_valid
        assert len(result.errors) > 0


class TestLoopExtraction:
    """Tests for loop block parsing."""

    def test_simple_for(self):
        template = "{% for item in items %}{{item}}{% endfor %}"
        result = TemplateParser.parse(template)
        assert result.is_valid
        # The loop iterator 'item' should not appear as a variable
        var_names = [v.name for v in result.variables]
        assert "item" not in var_names

    def test_unclosed_for(self):
        template = "{% for item in items %}{{item}}"
        result = TemplateParser.parse(template)
        assert not result.is_valid
        assert len(result.errors) > 0


class TestFunctionExtraction:
    """Tests for function call handling."""

    def test_function_call(self):
        result = TemplateParser.parse("{{upper(name)}}")
        assert result.is_valid
        # Function calls should be skipped as variables
        var_names = [v.name for v in result.variables]
        assert "upper" not in var_names

    def test_nested_function(self):
        result = TemplateParser.parse('{{default(name, "fallback")}}')
        assert result.is_valid
        var_names = [v.name for v in result.variables]
        assert "default" not in var_names


class TestComments:
    """Tests for comment handling."""

    def test_comments_stripped(self):
        template = "{# This is a comment #}Hello {{name}}"
        result = TemplateParser.parse(template)
        assert result.is_valid
        assert len(result.variables) == 1
        assert result.variables[0].name == "name"
        # The word "comment" should not appear anywhere in variable names
        for v in result.variables:
            assert "comment" not in v.name.lower()


class TestParameterGeneration:
    """Tests for parameter definition generation."""

    def test_generates_from_variables(self):
        result = TemplateParser.parse("{{name}} is {{age::number}}")
        assert len(result.parameters) == 2
        param_names = {p.name for p in result.parameters}
        assert "name" in param_names
        assert "age" in param_names
        age_param = next(p for p in result.parameters if p.name == "age")
        assert age_param.type == "number"

    def test_auto_generates_label(self):
        result = TemplateParser.parse("{{research_topic}}")
        assert len(result.parameters) == 1
        assert result.parameters[0].label == "Research Topic"

    def test_empty_template_no_parameters(self):
        result = TemplateParser.parse("")
        assert result.is_valid
        assert len(result.parameters) == 0
        assert len(result.variables) == 0


class TestValidation:
    """Tests for template validation."""

    def test_valid_template(self):
        result = TemplateParser.parse("Hello {{name}}, welcome!")
        assert result.is_valid
        assert len(result.errors) == 0

    def test_empty_variable_is_error(self):
        result = TemplateParser.parse("Hello {{ }}")
        assert not result.is_valid
        assert len(result.errors) > 0

    def test_unclosed_braces(self):
        result = TemplateParser.parse("Hello {{name")
        assert not result.is_valid
        assert len(result.errors) > 0
