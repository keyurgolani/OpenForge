"""Tests for the template renderer."""

import pytest

from openforge.runtime.template_engine.renderer import TemplateRenderer


class TestVariableSubstitution:
    """Tests for variable substitution."""

    def test_simple_variable(self):
        result = TemplateRenderer.render("Hello {{name}}", {"name": "World"})
        assert result.output == "Hello World"

    def test_typed_variable_strips_type(self):
        result = TemplateRenderer.render("Count: {{count::number}}", {"count": 42})
        assert result.output == "Count: 42"

    def test_missing_variable_becomes_empty(self):
        result = TemplateRenderer.render("Hello {{name}}", {})
        assert result.output == "Hello "
        assert len(result.warnings) > 0
        assert any("name" in w for w in result.warnings)

    def test_multiple_variables(self):
        result = TemplateRenderer.render(
            "{{greeting}}, {{name}}!",
            {"greeting": "Hello", "name": "World"},
        )
        assert result.output == "Hello, World!"

    def test_variable_with_spaces(self):
        result = TemplateRenderer.render("Hello {{ name }}", {"name": "World"})
        assert result.output == "Hello World"

    def test_dotted_path(self):
        result = TemplateRenderer.render(
            "Hello {{user.name}}",
            {"user": {"name": "Alice"}},
        )
        assert result.output == "Hello Alice"

    def test_tracks_variables_used(self):
        result = TemplateRenderer.render(
            "{{greeting}}, {{name}}!",
            {"greeting": "Hello", "name": "World"},
        )
        assert "greeting" in result.variables_used
        assert "name" in result.variables_used


class TestConditionals:
    """Tests for conditional blocks."""

    def test_if_true(self):
        result = TemplateRenderer.render(
            "{% if show %}visible{% endif %}",
            {"show": True},
        )
        assert result.output == "visible"

    def test_if_false(self):
        result = TemplateRenderer.render(
            "{% if show %}visible{% endif %}",
            {"show": False},
        )
        assert result.output == ""

    def test_if_else_true(self):
        result = TemplateRenderer.render(
            "{% if show %}yes{% else %}no{% endif %}",
            {"show": True},
        )
        assert result.output == "yes"

    def test_if_else_false(self):
        result = TemplateRenderer.render(
            "{% if show %}yes{% else %}no{% endif %}",
            {"show": False},
        )
        assert result.output == "no"

    def test_if_with_comparison(self):
        result = TemplateRenderer.render(
            '{% if status == "active" %}ON{% else %}OFF{% endif %}',
            {"status": "active"},
        )
        assert result.output == "ON"

    def test_if_truthy_string(self):
        result = TemplateRenderer.render(
            "{% if name %}has name{% endif %}",
            {"name": "Alice"},
        )
        assert result.output == "has name"

    def test_if_falsy_empty_string(self):
        result = TemplateRenderer.render(
            "{% if name %}has name{% endif %}",
            {"name": ""},
        )
        assert result.output == ""

    def test_nested_variables_in_conditional(self):
        result = TemplateRenderer.render(
            "{% if show %}Hello {{name}}{% endif %}",
            {"show": True, "name": "World"},
        )
        assert result.output == "Hello World"


class TestLoops:
    """Tests for loop blocks."""

    def test_simple_loop(self):
        result = TemplateRenderer.render(
            "{% for item in items %}{{item}} {% endfor %}",
            {"items": ["a", "b", "c"]},
        )
        assert result.output == "a b c "

    def test_loop_with_object(self):
        result = TemplateRenderer.render(
            "{% for user in users %}{{user.name}} {% endfor %}",
            {"users": [{"name": "Alice"}, {"name": "Bob"}]},
        )
        assert result.output == "Alice Bob "

    def test_empty_loop(self):
        result = TemplateRenderer.render(
            "{% for item in items %}{{item}}{% endfor %}",
            {"items": []},
        )
        assert result.output == ""

    def test_loop_index(self):
        result = TemplateRenderer.render(
            "{% for item in items %}{{loop.index}}:{{item}} {% endfor %}",
            {"items": ["a", "b", "c"]},
        )
        assert result.output == "0:a 1:b 2:c "


class TestFunctions:
    """Tests for function calls."""

    def test_upper_function(self):
        result = TemplateRenderer.render(
            "{{upper(name)}}",
            {"name": "hello"},
        )
        assert result.output == "HELLO"

    def test_default_function(self):
        result = TemplateRenderer.render(
            '{{default(name, "fallback")}}',
            {"name": ""},
        )
        assert result.output == "fallback"

    def test_join_function(self):
        result = TemplateRenderer.render(
            '{{join(items, ", ")}}',
            {"items": ["a", "b", "c"]},
        )
        assert result.output == "a, b, c"

    def test_nested_function_calls(self):
        result = TemplateRenderer.render(
            "{{upper(first(items))}}",
            {"items": ["hello", "world"]},
        )
        assert result.output == "HELLO"

    def test_tracks_functions_used(self):
        result = TemplateRenderer.render(
            "{{upper(name)}}",
            {"name": "hello"},
        )
        assert "upper" in result.functions_used


class TestComments:
    """Tests for comment removal."""

    def test_comments_removed(self):
        result = TemplateRenderer.render(
            "{# This is a comment #}Hello {{name}}",
            {"name": "World"},
        )
        assert result.output == "Hello World"
        assert "comment" not in result.output.lower()


class TestEndToEnd:
    """End-to-end rendering tests."""

    def test_research_agent_template(self):
        template = """\
{# Research Agent System Prompt #}
You are a {{agent_type}} research agent specializing in {{domain}}.

{% if detailed_mode %}
Provide thorough, in-depth analysis with citations.
{% else %}
Provide concise summaries.
{% endif %}

Your focus areas:
{% for topic in topics %}
- {{loop.index}}: {{topic}}
{% endfor %}

Output format: {{upper(output_format)}}
Default model: {{default(model, "gpt-4")}}
"""
        context = {
            "agent_type": "advanced",
            "domain": "machine learning",
            "detailed_mode": True,
            "topics": ["transformers", "reinforcement learning", "NLP"],
            "output_format": "markdown",
            "model": "",
        }
        result = TemplateRenderer.render(template, context)

        # No unresolved template syntax should remain
        assert "{{" not in result.output
        assert "{%" not in result.output
        assert "{#" not in result.output

        # Check key substitutions happened
        assert "advanced" in result.output
        assert "machine learning" in result.output
        assert "in-depth analysis" in result.output
        assert "concise summaries" not in result.output
        assert "transformers" in result.output
        assert "reinforcement learning" in result.output
        assert "MARKDOWN" in result.output
        assert "gpt-4" in result.output

        # Verify tracking
        assert "agent_type" in result.variables_used
        assert "domain" in result.variables_used
        assert "upper" in result.functions_used
        assert "default" in result.functions_used
