"""Tests for agent blueprint parsing and rendering."""

import hashlib

import pytest

from openforge.domains.agents.blueprint import (
    AgentBlueprint,
    parse_agent_md,
    render_agent_md,
    render_default_agent_md,
    slugify,
)


MINIMAL_MD = """---
name: Test Agent
slug: test-agent
---
You are a test agent.
"""

FULL_MD = """---
name: Research Agent
slug: research-agent
version: "2.0.0"
description: A research-focused agent
icon: magnifying_glass
tags:
  - research
  - analysis
mode: autonomous
strategy: researcher
model:
  default: gpt-4o
  provider: openai
  allow_override: false
  temperature: 0.7
  max_tokens: 4096
memory:
  history_limit: 50
  strategy: summarize
  attachment_support: false
output:
  execution_mode: batch
  require_structured: true
  require_citations: true
retrieval:
  enabled: true
  limit: 10
  score_threshold: 0.5
tools:
  - search_web
  - name: run_code
    confirm_before: true
    description: Execute code
confirm_before:
  - delete_file
---
You are a research agent specialized in analysis.

## Constraints
- Always cite sources
- Never fabricate data
"""

NO_FRONTMATTER = "Just a plain system prompt."

INVALID_YAML = """---
name: [invalid yaml
  this is broken
---
body text
"""


class TestParseAgentMd:
    def test_parse_minimal(self):
        blueprint, md_hash = parse_agent_md(MINIMAL_MD)
        assert blueprint.name == "Test Agent"
        assert blueprint.slug == "test-agent"
        assert blueprint.version == "1.0.0"
        assert blueprint.mode == "interactive"
        assert blueprint.strategy == "chat"
        assert "test agent" in blueprint.system_prompt.lower()
        assert md_hash == hashlib.sha256(MINIMAL_MD.encode()).hexdigest()

    def test_parse_full(self):
        blueprint, md_hash = parse_agent_md(FULL_MD)
        assert blueprint.name == "Research Agent"
        assert blueprint.slug == "research-agent"
        assert blueprint.version == "2.0.0"
        assert blueprint.description == "A research-focused agent"
        assert blueprint.icon == "magnifying_glass"
        assert "research" in blueprint.tags
        assert blueprint.mode == "autonomous"
        assert blueprint.strategy == "researcher"

        # Model config
        assert blueprint.model.default == "gpt-4o"
        assert blueprint.model.provider == "openai"
        assert blueprint.model.allow_override is False
        assert blueprint.model.temperature == 0.7
        assert blueprint.model.max_tokens == 4096

        # Memory config
        assert blueprint.memory.history_limit == 50
        assert blueprint.memory.strategy == "summarize"
        assert blueprint.memory.attachment_support is False

        # Output config
        assert blueprint.output.execution_mode == "batch"
        assert blueprint.output.require_structured is True
        assert blueprint.output.require_citations is True

        # Retrieval config
        assert blueprint.retrieval.enabled is True
        assert blueprint.retrieval.limit == 10
        assert blueprint.retrieval.score_threshold == 0.5

        # Tools
        assert len(blueprint.tools) == 2
        assert blueprint.tools[0].name == "search_web"
        assert blueprint.tools[0].confirm_before is False
        assert blueprint.tools[1].name == "run_code"
        assert blueprint.tools[1].confirm_before is True
        assert blueprint.tools[1].description == "Execute code"

        # Confirm before
        assert "delete_file" in blueprint.confirm_before

        # Constraints
        assert len(blueprint.constraints) == 2
        assert "Always cite sources" in blueprint.constraints
        assert "Never fabricate data" in blueprint.constraints

    def test_parse_no_frontmatter(self):
        blueprint, md_hash = parse_agent_md(NO_FRONTMATTER)
        assert blueprint.name == "untitled"
        assert blueprint.slug == "untitled"
        assert blueprint.system_prompt == NO_FRONTMATTER

    def test_parse_invalid_yaml(self):
        blueprint, md_hash = parse_agent_md(INVALID_YAML)
        assert blueprint.name == "untitled"
        assert md_hash == hashlib.sha256(INVALID_YAML.encode()).hexdigest()

    def test_hash_stability(self):
        _, hash1 = parse_agent_md(MINIMAL_MD)
        _, hash2 = parse_agent_md(MINIMAL_MD)
        assert hash1 == hash2

    def test_hash_change_detection(self):
        _, hash1 = parse_agent_md(MINIMAL_MD)
        modified = MINIMAL_MD.replace("Test Agent", "Modified Agent")
        _, hash2 = parse_agent_md(modified)
        assert hash1 != hash2

    def test_tools_as_strings(self):
        md = """---
name: Tool Agent
slug: tool-agent
tools:
  - search
  - scrape
---
System prompt.
"""
        blueprint, _ = parse_agent_md(md)
        assert len(blueprint.tools) == 2
        assert blueprint.tools[0].name == "search"
        assert blueprint.tools[1].name == "scrape"

    def test_tools_as_dicts(self):
        md = """---
name: Tool Agent
slug: tool-agent
tools:
  - name: dangerous_tool
    confirm_before: true
    description: Does something risky
---
System prompt.
"""
        blueprint, _ = parse_agent_md(md)
        assert len(blueprint.tools) == 1
        assert blueprint.tools[0].name == "dangerous_tool"
        assert blueprint.tools[0].confirm_before is True


class TestRenderAgentMd:
    def test_roundtrip_minimal(self):
        original, _ = parse_agent_md(MINIMAL_MD)
        rendered = render_agent_md(original)
        reparsed, _ = parse_agent_md(rendered)
        assert reparsed.name == original.name
        assert reparsed.slug == original.slug
        assert reparsed.mode == original.mode

    def test_roundtrip_full(self):
        original, _ = parse_agent_md(FULL_MD)
        rendered = render_agent_md(original)
        reparsed, _ = parse_agent_md(rendered)
        assert reparsed.name == original.name
        assert reparsed.slug == original.slug
        assert reparsed.strategy == original.strategy
        assert reparsed.model.default == original.model.default
        assert len(reparsed.constraints) == len(original.constraints)

    def test_render_contains_frontmatter(self):
        blueprint = AgentBlueprint(name="Test", slug="test")
        rendered = render_agent_md(blueprint)
        assert rendered.startswith("---\n")
        assert "name: Test" in rendered


class TestRenderDefaultAgentMd:
    def test_render_default(self):
        md = render_default_agent_md("My Workspace")
        blueprint, _ = parse_agent_md(md)
        assert blueprint.name == "My Workspace Assistant"
        assert blueprint.slug == "my-workspace-assistant"
        assert blueprint.mode == "interactive"
        assert len(blueprint.constraints) > 0


class TestSlugify:
    def test_simple(self):
        assert slugify("Hello World") == "hello-world"

    def test_special_chars(self):
        assert slugify("My Test!@#$% Workspace") == "my-test-workspace"

    def test_already_slug(self):
        assert slugify("already-a-slug") == "already-a-slug"
