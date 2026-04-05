"""Agent executor -- creates runs and drives the tool-loop lifecycle.

Replaces the StrategyExecutor + strategies/ layer with a single function
that directly manages RunModel state and calls execute_tool_loop().
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import RunModel
from openforge.domains.agents.compiled_spec import AgentRuntimeConfig
from openforge.runtime.events import (
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_STARTED,
    RuntimeEvent,
)
from openforge.runtime.lifecycle import transition_run
from openforge.runtime.tool_loop import (
    ToolLoopCallbacks,
    ToolLoopContext,
    ToolLoopResult,
    execute_tool_loop,
)

def _sanitize_pg_json(value):
    """Strip null bytes that PostgreSQL JSONB columns reject."""
    if value is None:
        return None
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_sanitize_pg_json(item) for item in value]
    if isinstance(value, dict):
        return {k: _sanitize_pg_json(v) for k, v in value.items()}
    return value

if TYPE_CHECKING:
    from openforge.runtime.event_publisher import EventPublisher
    from openforge.integrations.tools.dispatcher import ToolDispatcher
    from openforge.core.llm_gateway import LLMGateway

logger = logging.getLogger("openforge.runtime.agent_executor")


# ---------------------------------------------------------------------------
# Tool loading helper
# ---------------------------------------------------------------------------

async def _load_tools(
    dispatcher: ToolDispatcher,
    spec: AgentRuntimeConfig,
) -> "LoadedTools":
    """Load tools from the dispatcher, filtered by agent spec."""
    from openforge.runtime.chat_handler import (
        LoadedTools,
        _tool_id_to_fn_name,
        _tools_to_openai_schema,
    )

    raw_tools = await dispatcher.list_tools()

    if spec.allowed_tools is not None:
        allowed = set(spec.allowed_tools)
        raw_tools = [t for t in raw_tools if t["id"] in allowed]

    fn_name_to_tool_info: dict[str, dict[str, Any]] = {}
    for tool in raw_tools:
        fn_name_to_tool_info[_tool_id_to_fn_name(tool["id"])] = {
            "type": "builtin",
            "tool_id": tool["id"],
            "risk_level": tool.get("risk_level", "low"),
        }

    openai_tools = _tools_to_openai_schema(raw_tools)
    return LoadedTools(
        openai_tools=openai_tools,
        fn_name_to_tool_info=fn_name_to_tool_info,
    )


# ---------------------------------------------------------------------------
# LLM resolution helper
# ---------------------------------------------------------------------------

async def _resolve_llm(
    db: AsyncSession,
    spec: AgentRuntimeConfig,
) -> dict[str, Any]:
    """Resolve LLM provider credentials and model into llm_kwargs dict."""
    from openforge.services.llm_service import llm_service

    provider_name, api_key, model, base_url = (
        await llm_service.resolve_provider(
            db,
            provider_id=spec.provider_name,
            model_override=spec.model_name,
        )
    )
    return {
        "provider_name": provider_name,
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
    }


# ---------------------------------------------------------------------------
# Main executor
# ---------------------------------------------------------------------------

async def execute_agent(
    spec: AgentRuntimeConfig,
    input_payload: dict[str, Any],
    *,
    db: AsyncSession,
    run_id: UUID | None = None,
    event_publisher: EventPublisher | None = None,
    tool_dispatcher: ToolDispatcher | None = None,
    llm_gateway: LLMGateway | None = None,
    deployment_id: str | None = None,
    deployment_workspace_id: str | None = None,
    tool_callbacks: ToolLoopCallbacks | None = None,
) -> dict[str, Any]:
    """Execute an agent run.

    1. Create or load RunModel
    2. Build messages from input_payload
    3. Load tools (if enabled and dispatcher provided)
    4. Resolve LLM provider
    5. Transition run -> running, publish RUN_STARTED
    6. Call execute_tool_loop
    7. Transition run -> completed, publish RUN_COMPLETED
    8. Return output

    On error: transition -> failed, publish RUN_FAILED, re-raise.
    """
    from openforge.runtime.policy import ToolCallRateLimiter, policy_engine
    from openforge.runtime.hitl import hitl_service

    # 1. Create or load RunModel
    if run_id is None:
        run_id = uuid.uuid4()

    run = await db.get(RunModel, run_id)
    if run is None:
        run = RunModel(
            id=run_id,
            run_type="agent",
            status="pending",
            input_payload=input_payload,
            composite_metadata={
                "agent_id": str(spec.agent_id),
                "agent_slug": spec.agent_slug,
            },
        )
        db.add(run)
        await db.flush()

    # 2. Build messages
    messages = list(input_payload.get("messages", []))
    if not messages:
        user_msg = input_payload.get("message") or input_payload.get("instruction", "")
        if user_msg:
            messages = [{"role": "user", "content": user_msg}]

    # Prepend system prompt
    if not messages or messages[0].get("role") != "system":
        system_prompt = spec.system_prompt or "You are a helpful assistant."
        messages.insert(0, {"role": "system", "content": system_prompt})

    # 3. Load tools
    tools = None
    if spec.tools_enabled and tool_dispatcher is not None:
        try:
            tools = await _load_tools(tool_dispatcher, spec)
        except Exception as exc:
            logger.warning("Failed to load tools for run %s: %s", run_id, exc)

    # 4. Resolve LLM
    llm_kwargs = await _resolve_llm(db, spec)

    # 5. Build context and transition to running
    cancel_event = asyncio.Event()
    loop_ctx = ToolLoopContext(
        conversation_id=None,
        execution_id=str(run_id),
        agent_spec=spec,
        tools=tools,
        rate_limiter=ToolCallRateLimiter(max_per_minute=30, max_per_execution=200),
        policy_engine=policy_engine,
        hitl_service=hitl_service,
        cancel_event=cancel_event,
        db=None,
        deployment_id=deployment_id,
        deployment_workspace_id=deployment_workspace_id,
    )

    try:
        transition_run(run, "running")
        await db.commit()

        if event_publisher:
            await event_publisher.publish(
                RuntimeEvent(
                    run_id=run_id,
                    event_type=RUN_STARTED,
                    payload={
                        "agent_slug": spec.agent_slug,
                    },
                )
            )

        # 6. Execute tool loop
        result: ToolLoopResult = await execute_tool_loop(
            ctx=loop_ctx,
            messages=messages,
            callbacks=tool_callbacks,
            llm_kwargs=llm_kwargs,
            max_iterations=20,
            llm_gateway=llm_gateway,
            tool_dispatcher=tool_dispatcher,
        )

        # 7. Transition to completed
        output = {
            "output": result.full_response,
            "tool_calls": result.tool_calls,
            "timeline": result.timeline,
            "was_cancelled": result.was_cancelled,
        }
        transition_run(run, "completed")
        run.output_payload = _sanitize_pg_json(output)
        await db.commit()

        if event_publisher:
            await event_publisher.publish(
                RuntimeEvent(
                    run_id=run_id,
                    event_type=RUN_COMPLETED,
                    payload={
                        "output_preview": result.full_response[:500],
                    },
                )
            )

        return output

    except Exception as exc:
        logger.exception("Agent execution failed for run %s: %s", run_id, exc)

        try:
            transition_run(run, "failed", error_message=str(exc))
            await db.commit()
        except Exception:
            logger.warning("Failed to transition run %s to failed state", run_id)

        if event_publisher:
            try:
                await event_publisher.publish(
                    RuntimeEvent(
                        run_id=run_id,
                        event_type=RUN_FAILED,
                        payload={"error": str(exc)[:500]},
                    )
                )
            except Exception:
                pass

        raise
