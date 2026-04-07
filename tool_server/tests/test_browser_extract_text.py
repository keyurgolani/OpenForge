"""Unit tests for BrowserExtractTextTool."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from tools.browser.extract_text import BrowserExtractTextTool
from protocol import ToolContext


def _make_tool(evaluate_return=None, evaluate_side_effect=None):
    """Build a BrowserExtractTextTool with a mocked PinchTab client."""
    mock_client = MagicMock()
    if evaluate_side_effect:
        mock_client.evaluate = AsyncMock(side_effect=evaluate_side_effect)
    else:
        mock_client.evaluate = AsyncMock(return_value=evaluate_return or {})
    return BrowserExtractTextTool(mock_client), mock_client


def _ctx():
    return ToolContext(run_id="test-run", workspace_id=None, conversation_id=None)


class TestBrowserExtractTextMetadata:
    def test_tool_id(self):
        tool, _ = _make_tool()
        assert tool.id == "browser.extract_text"

    def test_category(self):
        tool, _ = _make_tool()
        assert tool.category == "browser"

    def test_risk_level(self):
        tool, _ = _make_tool()
        assert tool.risk_level == "low"

    def test_input_schema_has_tab_id_and_max_chars(self):
        tool, _ = _make_tool()
        props = tool.input_schema["properties"]
        assert "tab_id" in props
        assert "max_chars" in props


class TestBrowserExtractTextExecution:
    @pytest.mark.asyncio
    async def test_successful_extraction(self):
        page_text = "Welcome to the example page. It has plenty of content for testing."
        tool, client = _make_tool(evaluate_return={"result": page_text})

        result = await tool.execute({"max_chars": 8000}, _ctx())

        assert result.success is True
        assert page_text in result.output
        client.evaluate.assert_awaited_once_with("document.body.innerText")

    @pytest.mark.asyncio
    async def test_truncation_at_max_chars(self):
        long_text = "A" * 10000
        tool, _ = _make_tool(evaluate_return={"result": long_text})

        result = await tool.execute({"max_chars": 500}, _ctx())

        assert result.success is True
        assert len(result.output) < 10000
        assert "[... truncated]" in result.output

    @pytest.mark.asyncio
    async def test_max_chars_capped_at_80000(self):
        long_text = "B" * 100000
        tool, _ = _make_tool(evaluate_return={"result": long_text})

        result = await tool.execute({"max_chars": 200000}, _ctx())

        assert result.success is True
        assert "[... truncated]" in result.output

    @pytest.mark.asyncio
    async def test_minimal_content_returns_message(self):
        tool, _ = _make_tool(evaluate_return={"result": "Hi"})

        result = await tool.execute({}, _ctx())

        assert result.success is True
        assert "minimal" in result.output.lower()

    @pytest.mark.asyncio
    async def test_empty_content_returns_message(self):
        tool, _ = _make_tool(evaluate_return={"result": ""})

        result = await tool.execute({}, _ctx())

        assert result.success is True
        assert "minimal" in result.output.lower()

    @pytest.mark.asyncio
    async def test_client_exception_returns_failure(self):
        tool, _ = _make_tool(evaluate_side_effect=Exception("Connection refused"))

        result = await tool.execute({}, _ctx())

        assert result.success is False
        assert "extraction failed" in result.error.lower()
        assert result.recovery_hints is not None

    @pytest.mark.asyncio
    async def test_uses_value_key_fallback(self):
        tool, _ = _make_tool(evaluate_return={"value": "Content from value key with enough text to pass."})

        result = await tool.execute({}, _ctx())

        assert result.success is True
        assert "Content from value key" in result.output
