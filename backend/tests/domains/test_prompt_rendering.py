from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from openforge.domains.prompts.rendering import (
    PromptRenderError,
    PromptRenderValidationError,
    render_prompt_version,
    select_prompt_version,
)


def _definition():
    return SimpleNamespace(
        id=uuid4(),
        owner_type="system",
        owner_id=None,
    )


def _version(
    version: int = 1,
    *,
    status: str = "active",
    template: str = "Hello {name}",
    variable_schema: dict | None = None,
):
    return SimpleNamespace(
        id=uuid4(),
        prompt_definition_id=uuid4(),
        version=version,
        status=status,
        template=template,
        template_format="format_string",
        variable_schema=variable_schema
        or {
            "name": {"type": "string", "required": True},
        },
    )


def test_render_prompt_version_returns_rendered_content_and_metadata():
    rendered = render_prompt_version(_definition(), _version(), {"name": "OpenForge"})

    assert rendered.content == "Hello OpenForge"
    assert rendered.metadata.prompt_version == 1
    assert rendered.metadata.owner_type == "system"
    assert rendered.metadata.variable_keys == ["name"]


def test_render_prompt_version_rejects_missing_required_variables():
    with pytest.raises(PromptRenderValidationError) as exc:
        render_prompt_version(_definition(), _version(), {})

    assert exc.value.reason_code == "missing_variables"
    assert exc.value.details["missing"] == ["name"]


def test_render_prompt_version_rejects_undeclared_variables_in_strict_mode():
    with pytest.raises(PromptRenderValidationError) as exc:
        render_prompt_version(_definition(), _version(), {"name": "OpenForge", "extra": "value"})

    assert exc.value.reason_code == "extra_variables"
    assert exc.value.details["extra"] == ["extra"]


def test_render_prompt_version_rejects_invalid_variable_types():
    with pytest.raises(PromptRenderValidationError) as exc:
        render_prompt_version(_definition(), _version(), {"name": 42})

    assert exc.value.reason_code == "invalid_variable_type"
    assert exc.value.details["name"]["expected"] == "string"


def test_select_prompt_version_prefers_active_version_and_supports_explicit_selection():
    versions = [
        _version(1, status="inactive"),
        _version(2, status="active"),
        _version(3, status="draft"),
    ]

    assert select_prompt_version(versions).version == 2
    assert select_prompt_version(versions, requested_version=1).version == 1


def test_select_prompt_version_fails_loudly_when_requested_version_is_missing():
    with pytest.raises(PromptRenderError) as exc:
        select_prompt_version([_version(1, status="inactive")], requested_version=99)

    assert exc.value.reason_code == "prompt_version_not_found"
