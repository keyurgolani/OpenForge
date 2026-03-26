"""Tests for context-aware preamble/postamble construction."""

from openforge.runtime.prompt_context import (
    ExecutionContext,
    build_preamble,
    build_postamble,
)


class TestExecutionContext:
    def test_enum_values(self):
        assert ExecutionContext.CHAT == "chat"
        assert ExecutionContext.AUTOMATION == "automation"


class TestBuildPreambleChat:
    """Chat preamble: conversational, no JSON format instructions."""

    def test_includes_agent_name(self):
        preamble = build_preamble(
            agent_name="Research Agent",
            agent_description="Researches topics deeply",
            context=ExecutionContext.CHAT,
        )
        assert "Research Agent" in preamble

    def test_includes_conversational_instructions(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.CHAT,
        )
        assert "conversation" in preamble.lower() or "conversational" in preamble.lower()
        assert "Do NOT wrap your response in JSON" in preamble

    def test_no_json_format_instructions(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.CHAT,
            output_definitions=[
                {"key": "result", "type": "string", "label": "Research result"},
            ],
        )
        assert "```output" not in preamble
        assert "MUST structure your final response" not in preamble

    def test_output_defs_as_content_guidance(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.CHAT,
            output_definitions=[
                {"key": "summary", "type": "string", "label": "Brief summary"},
                {"key": "findings", "type": "string", "label": "Detailed findings"},
            ],
        )
        assert "Brief summary" in preamble
        assert "Detailed findings" in preamble
        assert "naturally" in preamble.lower() or "conversational" in preamble.lower()

    def test_input_values_shown(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.CHAT,
            input_values={"topic": "climate change", "depth": "detailed"},
        )
        assert "climate change" in preamble
        assert "topic" in preamble

    def test_no_output_defs_no_guidance_section(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.CHAT,
        )
        assert "Response Content" not in preamble

    def test_includes_date(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.CHAT,
        )
        import re
        assert re.search(r"\d{4}-\d{2}-\d{2}", preamble)


class TestBuildPreambleAutomation:
    """Automation preamble: structured JSON output instructions."""

    def test_includes_json_format_instructions(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.AUTOMATION,
            output_definitions=[
                {"key": "result", "type": "string", "label": "Result"},
            ],
        )
        assert "```output" in preamble
        assert "MUST structure" in preamble

    def test_includes_input_schema_docs(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.AUTOMATION,
            input_schema=[
                {"name": "query", "type": "text", "required": True, "description": "Search query"},
            ],
        )
        assert "query" in preamble
        assert "required" in preamble.lower()

    def test_no_output_defs_no_output_section(self):
        preamble = build_preamble(
            agent_name="Test",
            agent_description="",
            context=ExecutionContext.AUTOMATION,
        )
        assert "```output" not in preamble


class TestBuildPostamble:
    """Postamble is the same for both contexts."""

    def test_includes_workspace_info(self):
        postamble = build_postamble(
            workspace_id=None,
            workspaces_data=[{"id": "ws-1", "name": "Research", "description": "Research workspace", "knowledge_count": 5}],
            agents_data=[],
            tools_data=[],
            skills_data=[],
            tools_enabled=True,
        )
        assert "Research" in postamble
        assert "ws-1" in postamble

    def test_single_workspace_auto_inject(self):
        postamble = build_postamble(
            workspace_id=None,
            workspaces_data=[{"id": "ws-1", "name": "Only", "description": "", "knowledge_count": 0}],
            agents_data=[],
            tools_data=[],
            skills_data=[],
            tools_enabled=True,
        )
        assert "Always use this workspace_id" in postamble

    def test_multi_workspace_generic_message(self):
        postamble = build_postamble(
            workspace_id=None,
            workspaces_data=[
                {"id": "ws-1", "name": "A", "description": "", "knowledge_count": 0},
                {"id": "ws-2", "name": "B", "description": "", "knowledge_count": 0},
            ],
            agents_data=[],
            tools_data=[],
            skills_data=[],
            tools_enabled=True,
        )
        assert "MUST pass" in postamble

    def test_tooling_disabled_notice(self):
        postamble = build_postamble(
            workspace_id=None,
            workspaces_data=[],
            agents_data=[],
            tools_data=[],
            skills_data=[],
            tools_enabled=False,
        )
        assert "Tooling disabled" in postamble
