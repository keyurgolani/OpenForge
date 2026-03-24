"""Tests for template engine type definitions."""

import pytest

from openforge.runtime.template_engine.types import (
    ParameterDefinition,
    TemplateParseResult,
    TemplateRenderResult,
    TemplateVariable,
    ValidationRule,
    normalize_enum_options,
    normalize_variable_type,
    parse_type_indicator,
)


class TestNormalizeVariableType:
    """Tests for normalize_variable_type helper."""

    def test_text_canonical(self):
        assert normalize_variable_type("text") == "text"

    def test_text_alias_string(self):
        assert normalize_variable_type("string") == "text"

    def test_text_alias_str(self):
        assert normalize_variable_type("str") == "text"

    def test_textarea_canonical(self):
        assert normalize_variable_type("textarea") == "textarea"

    def test_textarea_alias_longtext(self):
        assert normalize_variable_type("longtext") == "textarea"

    def test_textarea_alias_long_text(self):
        assert normalize_variable_type("long_text") == "textarea"

    def test_number_canonical(self):
        assert normalize_variable_type("number") == "number"

    def test_number_alias_numeric(self):
        assert normalize_variable_type("numeric") == "number"

    def test_number_alias_integer(self):
        assert normalize_variable_type("integer") == "number"

    def test_number_alias_float(self):
        assert normalize_variable_type("float") == "number"

    def test_number_alias_int(self):
        assert normalize_variable_type("int") == "number"

    def test_boolean_canonical(self):
        assert normalize_variable_type("boolean") == "boolean"

    def test_boolean_alias_bool(self):
        assert normalize_variable_type("bool") == "boolean"

    def test_enum_canonical(self):
        assert normalize_variable_type("enum") == "enum"

    def test_enum_alias_select(self):
        assert normalize_variable_type("select") == "enum"

    def test_enum_alias_multiselect(self):
        assert normalize_variable_type("multiselect") == "enum"

    def test_unknown_returns_none(self):
        assert normalize_variable_type("unknown") is None

    def test_empty_returns_none(self):
        assert normalize_variable_type("") is None

    def test_case_insensitive_upper(self):
        assert normalize_variable_type("TEXT") == "text"

    def test_case_insensitive_mixed(self):
        assert normalize_variable_type("Boolean") == "boolean"

    def test_case_insensitive_alias(self):
        assert normalize_variable_type("STRING") == "text"


class TestNormalizeEnumOptions:
    """Tests for normalize_enum_options helper."""

    def test_list_input(self):
        assert normalize_enum_options(["a", "b", "c"]) == ["a", "b", "c"]

    def test_deduplication(self):
        result = normalize_enum_options(["a", "b", "a", "c", "b"])
        assert result == ["a", "b", "c"]

    def test_whitespace_stripping(self):
        assert normalize_enum_options(["  a ", " b", "c  "]) == ["a", "b", "c"]

    def test_csv_string(self):
        assert normalize_enum_options("a, b, c") == ["a", "b", "c"]

    def test_bracket_syntax(self):
        assert normalize_enum_options("[opt1, opt2, opt3]") == [
            "opt1",
            "opt2",
            "opt3",
        ]

    def test_empty_list(self):
        assert normalize_enum_options([]) == []

    def test_empty_string(self):
        assert normalize_enum_options("") == []

    def test_none_input(self):
        assert normalize_enum_options(None) == []


class TestParseTypeIndicator:
    """Tests for parse_type_indicator helper."""

    def test_double_colon_text(self):
        result = parse_type_indicator("::text")
        assert result is not None
        assert result["type"] == "text"
        assert result["enum_options"] == []

    def test_double_colon_enum_bracket(self):
        result = parse_type_indicator("::[low, medium, high]")
        assert result is not None
        assert result["type"] == "enum"
        assert result["enum_options"] == ["low", "medium", "high"]

    def test_single_colon_returns_none(self):
        result = parse_type_indicator(":number")
        assert result is None

    def test_empty_returns_none(self):
        result = parse_type_indicator("")
        assert result is None

    def test_double_colon_number(self):
        result = parse_type_indicator("::number")
        assert result is not None
        assert result["type"] == "number"
        assert result["enum_options"] == []

    def test_double_colon_boolean(self):
        result = parse_type_indicator("::boolean")
        assert result is not None
        assert result["type"] == "boolean"
        assert result["enum_options"] == []


class TestParameterDefinition:
    """Tests for ParameterDefinition model."""

    def test_defaults(self):
        param = ParameterDefinition(name="my_param", type="text", label="My Param")
        assert param.name == "my_param"
        assert param.type == "text"
        assert param.label == "My Param"
        assert param.required is True
        assert param.description is None
        assert param.default is None
        assert param.options is None
        assert param.validation is None

    def test_label(self):
        param = ParameterDefinition(
            name="greeting", type="textarea", label="Greeting Message"
        )
        assert param.label == "Greeting Message"

    def test_enum_with_options(self):
        param = ParameterDefinition(
            name="priority",
            type="enum",
            label="Priority Level",
            options=["low", "medium", "high"],
            required=False,
            default="medium",
        )
        assert param.type == "enum"
        assert param.options == ["low", "medium", "high"]
        assert param.required is False
        assert param.default == "medium"

    def test_with_validation(self):
        rules = [
            ValidationRule(type="min_length", value=3, message="Too short"),
        ]
        param = ParameterDefinition(
            name="title", type="text", label="Title", validation=rules
        )
        assert param.validation is not None
        assert len(param.validation) == 1
        assert param.validation[0].type == "min_length"
        assert param.validation[0].value == 3
        assert param.validation[0].message == "Too short"

    def test_with_description(self):
        param = ParameterDefinition(
            name="name",
            type="text",
            label="Name",
            description="Enter your full name",
        )
        assert param.description == "Enter your full name"


class TestTemplateVariable:
    """Tests for TemplateVariable model."""

    def test_defaults(self):
        var = TemplateVariable(name="my_var")
        assert var.name == "my_var"
        assert var.type_indicator is None
        assert var.has_explicit_type is False
        assert var.resolved_type == "text"
        assert var.enum_options == []
        assert var.position is None

    def test_with_all_fields(self):
        var = TemplateVariable(
            name="priority",
            type_indicator="::[low, medium, high]",
            has_explicit_type=True,
            resolved_type="enum",
            enum_options=["low", "medium", "high"],
            position={"start": 0, "end": 42, "line": 1, "column": 1},
        )
        assert var.name == "priority"
        assert var.type_indicator == "::[low, medium, high]"
        assert var.has_explicit_type is True
        assert var.resolved_type == "enum"
        assert var.enum_options == ["low", "medium", "high"]
        assert var.position == {"start": 0, "end": 42, "line": 1, "column": 1}


class TestTemplateParseResult:
    """Tests for TemplateParseResult model."""

    def test_empty_result(self):
        result = TemplateParseResult()
        assert result.is_valid is True
        assert result.variables == []
        assert result.parameters == []
        assert result.errors == []
        assert result.warnings == []

    def test_invalid_with_errors(self):
        result = TemplateParseResult(
            is_valid=False,
            errors=["Unclosed variable tag", "Duplicate variable name"],
        )
        assert result.is_valid is False
        assert len(result.errors) == 2
        assert "Unclosed variable tag" in result.errors

    def test_with_variables_and_parameters(self):
        var = TemplateVariable(name="greeting")
        param = ParameterDefinition(name="greeting", type="text", label="Greeting")
        result = TemplateParseResult(
            variables=[var],
            parameters=[param],
        )
        assert len(result.variables) == 1
        assert len(result.parameters) == 1
        assert result.is_valid is True

    def test_with_warnings(self):
        result = TemplateParseResult(
            warnings=["Variable 'x' has no default value"],
        )
        assert result.is_valid is True
        assert len(result.warnings) == 1


class TestTemplateRenderResult:
    """Tests for TemplateRenderResult model."""

    def test_defaults(self):
        result = TemplateRenderResult()
        assert result.output == ""
        assert result.variables_used == []
        assert result.functions_used == []
        assert result.warnings == []

    def test_with_output(self):
        result = TemplateRenderResult(
            output="Hello, World!",
            variables_used=["greeting", "name"],
            functions_used=["upper"],
            warnings=["Variable 'title' was empty"],
        )
        assert result.output == "Hello, World!"
        assert result.variables_used == ["greeting", "name"]
        assert result.functions_used == ["upper"]
        assert len(result.warnings) == 1


class TestValidationRule:
    """Tests for ValidationRule model."""

    def test_required_fields(self):
        rule = ValidationRule(type="min_length", value=5)
        assert rule.type == "min_length"
        assert rule.value == 5
        assert rule.message is None

    def test_with_message(self):
        rule = ValidationRule(
            type="max_length", value=100, message="Too long"
        )
        assert rule.message == "Too long"
