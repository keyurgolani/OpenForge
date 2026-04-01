"""Tests for agent_executor."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openforge.runtime.agent_executor import execute_agent, _load_tools


class TestExecuteAgent:
    """Tests for the execute_agent function."""

    @pytest.mark.asyncio
    async def test_happy_path_creates_run_and_completes(self):
        """execute_agent creates a run, calls tool loop, returns output, publishes events."""
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_publisher = MagicMock()
        mock_publisher.publish = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.system_prompt = "You are a test agent."
        spec.tools_enabled = False
        spec.provider_name = None
        spec.model_name = None

        fake_result = MagicMock()
        fake_result.full_response = "Hello from the agent"
        fake_result.tool_calls = []
        fake_result.timeline = []
        fake_result.was_cancelled = False

        with patch(
            "openforge.runtime.agent_executor._resolve_llm",
            new_callable=AsyncMock,
            return_value={"provider_name": "openai", "api_key": "k", "model": "gpt-4", "base_url": None},
        ), patch(
            "openforge.runtime.agent_executor.execute_tool_loop",
            new_callable=AsyncMock,
            return_value=fake_result,
        ) as mock_tool_loop:
            result = await execute_agent(
                spec,
                {"message": "hello"},
                db=mock_db,
                workspace_id=uuid.uuid4(),
                event_publisher=mock_publisher,
            )

        assert result["output"] == "Hello from the agent"
        assert result["was_cancelled"] is False

        # Verify tool loop was called
        mock_tool_loop.assert_called_once()

        # Verify events: RUN_STARTED and RUN_COMPLETED
        event_types = [call.args[0].event_type for call in mock_publisher.publish.call_args_list]
        assert "run_started" in event_types
        assert "run_completed" in event_types

    @pytest.mark.asyncio
    async def test_failure_transitions_run_to_failed(self):
        """On error, execute_agent transitions run to failed, publishes RUN_FAILED."""
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_publisher = MagicMock()
        mock_publisher.publish = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.system_prompt = "You are a test agent."
        spec.tools_enabled = False
        spec.provider_name = None
        spec.model_name = None

        with patch(
            "openforge.runtime.agent_executor._resolve_llm",
            new_callable=AsyncMock,
            return_value={"provider_name": "openai", "api_key": "k", "model": "gpt-4", "base_url": None},
        ), patch(
            "openforge.runtime.agent_executor.execute_tool_loop",
            new_callable=AsyncMock,
            side_effect=RuntimeError("LLM exploded"),
        ):
            with pytest.raises(RuntimeError, match="LLM exploded"):
                await execute_agent(
                    spec,
                    {"message": "hello"},
                    db=mock_db,
                    workspace_id=uuid.uuid4(),
                    event_publisher=mock_publisher,
                )

        # Should have published RUN_STARTED and RUN_FAILED
        event_types = [call.args[0].event_type for call in mock_publisher.publish.call_args_list]
        assert "run_started" in event_types
        assert "run_failed" in event_types

    @pytest.mark.asyncio
    async def test_tools_loaded_when_enabled(self):
        """When tools_enabled=True and dispatcher provided, tools are loaded and passed to tool loop."""
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.system_prompt = "You are a test agent."
        spec.tools_enabled = True
        spec.allowed_tools = None
        spec.provider_name = None
        spec.model_name = None

        mock_dispatcher = MagicMock()
        mock_dispatcher.list_tools = AsyncMock(return_value=[
            {"id": "workspace.list", "description": "List workspaces", "risk_level": "low"},
            {"id": "file.read", "description": "Read a file", "risk_level": "medium"},
        ])

        fake_result = MagicMock()
        fake_result.full_response = "Done"
        fake_result.tool_calls = []
        fake_result.timeline = []
        fake_result.was_cancelled = False

        with patch(
            "openforge.runtime.agent_executor._resolve_llm",
            new_callable=AsyncMock,
            return_value={"provider_name": "openai", "api_key": "k", "model": "gpt-4", "base_url": None},
        ), patch(
            "openforge.runtime.agent_executor.execute_tool_loop",
            new_callable=AsyncMock,
            return_value=fake_result,
        ) as mock_tool_loop:
            await execute_agent(
                spec,
                {"message": "hello"},
                db=mock_db,
                workspace_id=uuid.uuid4(),
                tool_dispatcher=mock_dispatcher,
            )

        # Verify execute_tool_loop was called with tools loaded in context
        call_kwargs = mock_tool_loop.call_args
        ctx = call_kwargs.kwargs.get("ctx") or call_kwargs[0][0]
        assert ctx.tools is not None
        assert len(ctx.tools.openai_tools) == 2
        assert "workspace__list" in ctx.tools.fn_name_to_tool_info
        assert "file__read" in ctx.tools.fn_name_to_tool_info

    @pytest.mark.asyncio
    async def test_messages_built_from_input_payload(self):
        """Messages are built from input_payload with system prompt prepended."""
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.system_prompt = "Custom system prompt"
        spec.tools_enabled = False
        spec.provider_name = None
        spec.model_name = None

        fake_result = MagicMock()
        fake_result.full_response = "ok"
        fake_result.tool_calls = []
        fake_result.timeline = []
        fake_result.was_cancelled = False

        with patch(
            "openforge.runtime.agent_executor._resolve_llm",
            new_callable=AsyncMock,
            return_value={"provider_name": "openai", "api_key": "k", "model": "gpt-4", "base_url": None},
        ), patch(
            "openforge.runtime.agent_executor.execute_tool_loop",
            new_callable=AsyncMock,
            return_value=fake_result,
        ) as mock_tool_loop:
            await execute_agent(
                spec,
                {"message": "do something"},
                db=mock_db,
                workspace_id=uuid.uuid4(),
            )

        # Check messages passed to tool loop
        call_kwargs = mock_tool_loop.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs[0][1]
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "Custom system prompt"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "do something"

    @pytest.mark.asyncio
    async def test_existing_run_is_reused(self):
        """When run_id is provided and run exists, it is reused."""
        existing_run_id = uuid.uuid4()
        existing_run = MagicMock()
        existing_run.id = existing_run_id
        existing_run.status = "pending"
        existing_run.started_at = None

        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=existing_run)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.system_prompt = ""
        spec.tools_enabled = False
        spec.provider_name = None
        spec.model_name = None

        fake_result = MagicMock()
        fake_result.full_response = "done"
        fake_result.tool_calls = []
        fake_result.timeline = []
        fake_result.was_cancelled = False

        with patch(
            "openforge.runtime.agent_executor._resolve_llm",
            new_callable=AsyncMock,
            return_value={"provider_name": "openai", "api_key": "k", "model": "gpt-4", "base_url": None},
        ), patch(
            "openforge.runtime.agent_executor.execute_tool_loop",
            new_callable=AsyncMock,
            return_value=fake_result,
        ):
            result = await execute_agent(
                spec,
                {"message": "hello"},
                db=mock_db,
                workspace_id=uuid.uuid4(),
                run_id=existing_run_id,
            )

        assert result["output"] == "done"
        # db.add should NOT be called since run already exists
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_events_without_publisher(self):
        """When no event_publisher is provided, execution still succeeds."""
        mock_db = MagicMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        spec = MagicMock()
        spec.agent_id = uuid.uuid4()
        spec.agent_slug = "test-agent"
        spec.system_prompt = ""
        spec.tools_enabled = False
        spec.provider_name = None
        spec.model_name = None

        fake_result = MagicMock()
        fake_result.full_response = "output"
        fake_result.tool_calls = []
        fake_result.timeline = []
        fake_result.was_cancelled = False

        with patch(
            "openforge.runtime.agent_executor._resolve_llm",
            new_callable=AsyncMock,
            return_value={"provider_name": "openai", "api_key": "k", "model": "gpt-4", "base_url": None},
        ), patch(
            "openforge.runtime.agent_executor.execute_tool_loop",
            new_callable=AsyncMock,
            return_value=fake_result,
        ):
            result = await execute_agent(
                spec,
                {"message": "hello"},
                db=mock_db,
                workspace_id=uuid.uuid4(),
                # no event_publisher
            )

        assert result["output"] == "output"


class TestLoadTools:
    """Tests for the _load_tools helper."""

    @pytest.mark.asyncio
    async def test_loads_and_converts_tools(self):
        """Tools are fetched from dispatcher and converted to OpenAI schema."""
        mock_dispatcher = MagicMock()
        mock_dispatcher.list_tools = AsyncMock(return_value=[
            {"id": "workspace.list", "description": "List workspaces", "risk_level": "low"},
            {"id": "file.read", "description": "Read a file"},
        ])

        spec = MagicMock()
        spec.allowed_tools = None

        tools = await _load_tools(mock_dispatcher, spec)

        assert len(tools.openai_tools) == 2
        assert tools.openai_tools[0]["type"] == "function"
        assert tools.openai_tools[0]["function"]["name"] == "workspace__list"
        assert "workspace__list" in tools.fn_name_to_tool_info
        assert tools.fn_name_to_tool_info["workspace__list"]["tool_id"] == "workspace.list"
        # Default risk_level when not provided
        assert tools.fn_name_to_tool_info["file__read"]["risk_level"] == "low"

    @pytest.mark.asyncio
    async def test_filters_by_allowed_tools(self):
        """When spec.allowed_tools is set, only those tools are included."""
        mock_dispatcher = MagicMock()
        mock_dispatcher.list_tools = AsyncMock(return_value=[
            {"id": "workspace.list", "description": "List workspaces"},
            {"id": "file.read", "description": "Read a file"},
            {"id": "file.write", "description": "Write a file"},
        ])

        spec = MagicMock()
        spec.allowed_tools = ["file.read"]

        tools = await _load_tools(mock_dispatcher, spec)

        assert len(tools.openai_tools) == 1
        assert tools.openai_tools[0]["function"]["name"] == "file__read"
        assert "workspace__list" not in tools.fn_name_to_tool_info
