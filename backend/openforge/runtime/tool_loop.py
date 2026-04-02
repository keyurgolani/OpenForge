"""Shared tool execution loop used by both chat_handler (interactive) and ChatStrategy (background)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.domains.agents.compiled_spec import AgentRuntimeConfig

if TYPE_CHECKING:
    from openforge.runtime.chat_handler import LoadedTools
    from openforge.runtime.policy import PolicyEngine, ToolCallRateLimiter
    from openforge.runtime.hitl import HITLService
    from openforge.integrations.tools.dispatcher import ToolDispatcher
    from openforge.core.llm_gateway import LLMGateway

logger = logging.getLogger("openforge.runtime.tool_loop")

_MAX_LLM_TOOL_RESULT_CHARS = 12_000
_COMPACT_TOOL_RESULT_CHARS = 2_000
_COMPACT_AFTER_N_TOOL_RESULTS = 8
_TOOL_NAME_SEP = "__"
_TIMELINE_TEXT_OUTPUT_CHARS = 2_000
_TIMELINE_UNTRUSTED_TEXT_CHARS = 4_000
_UNTRUSTED_CONTENT_RE = re.compile(r"^\s*<untrusted_content\b[^>]*>\s*([\s\S]*?)\s*</untrusted_content>\s*$", re.IGNORECASE)


def _tool_id_to_fn_name(tool_id: str) -> str:
    return tool_id.replace(".", _TOOL_NAME_SEP)


def _fn_name_to_tool_id(fn_name: str) -> str:
    return fn_name.replace(_TOOL_NAME_SEP, ".")


def _truncate_text(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[:limit] + "..."


def _unwrap_untrusted_content(value: str) -> str | None:
    match = _UNTRUSTED_CONTENT_RE.match(value)
    return match.group(1).strip() if match else None


def _try_parse_json(value: str) -> Any | None:
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _compact_old_tool_results(messages: list[dict[str, Any]]) -> None:
    """Trim older tool results in-place to limit context growth in long-running loops.

    Only activates once more than COMPACT_AFTER_N_TOOL_RESULTS tool messages exist.
    Keeps the most recent 6 tool results at full size; trims older ones to
    COMPACT_TOOL_RESULT_CHARS.
    """
    tool_indices = [i for i, m in enumerate(messages) if m.get("role") == "tool"]
    if len(tool_indices) <= _COMPACT_AFTER_N_TOOL_RESULTS:
        return
    keep_recent = 6
    for idx in tool_indices[:-keep_recent]:
        content = messages[idx].get("content", "")
        if len(content) > _COMPACT_TOOL_RESULT_CHARS:
            messages[idx]["content"] = content[:_COMPACT_TOOL_RESULT_CHARS] + " [trimmed]"



def _prepare_timeline_output(output: Any) -> Any:
    if output is None:
        return None

    if isinstance(output, (dict, list, bool, int, float)):
        return output

    if isinstance(output, str):
        unwrapped = _unwrap_untrusted_content(output)
        if unwrapped is not None:
            parsed_unwrapped = _try_parse_json(unwrapped)
            if parsed_unwrapped is not None:
                return parsed_unwrapped
            return _truncate_text(unwrapped, _TIMELINE_UNTRUSTED_TEXT_CHARS)

        parsed = _try_parse_json(output)
        if parsed is not None:
            return parsed

        return _truncate_text(output, _TIMELINE_TEXT_OUTPUT_CHARS)

    return _truncate_text(str(output), _TIMELINE_TEXT_OUTPUT_CHARS)


@dataclass
class ToolLoopContext:
    workspace_id: UUID | None
    conversation_id: UUID | None
    execution_id: str
    agent_spec: AgentRuntimeConfig | None = None
    tools: LoadedTools | None = None
    rate_limiter: ToolCallRateLimiter | None = None
    policy_engine: PolicyEngine | None = None
    hitl_service: HITLService | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    db: AsyncSession | None = None
    session_factory: Any = None  # async_sessionmaker — used for side-channel DB ops (HITL, policy)
    default_workspace_id: str | None = None
    # Root forwarding context for nested agent invocations — enables events
    # from arbitrarily deep subagent chains to reach the top-level WebSocket.
    root_execution_id: str | None = None
    root_conversation_id: str | None = None
    root_workspace_id: str | None = None
    call_id_path: list[str] = field(default_factory=list)


@dataclass
class ToolLoopCallbacks:
    on_thinking: Callable | None = None
    on_token: Callable | None = None
    on_tool_start: Callable | None = None
    on_tool_result: Callable | None = None
    on_hitl_request: Callable | None = None
    on_hitl_resolved: Callable | None = None
    on_intermediate_response: Callable | None = None


@dataclass
class ToolLoopResult:
    full_response: str = ""
    full_thinking: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    timeline: list[dict[str, Any]] = field(default_factory=list)
    was_cancelled: bool = False
    messages: list[dict[str, Any]] = field(default_factory=list)
    intermediate_response_total: int = 0


async def execute_tool_loop(
    ctx: ToolLoopContext,
    messages: list[dict[str, Any]],
    callbacks: ToolLoopCallbacks | None,
    *,
    llm_kwargs: dict[str, Any],
    max_iterations: int = 20,
    llm_gateway: LLMGateway | None = None,
    tool_dispatcher: ToolDispatcher | None = None,
    result: ToolLoopResult | None = None,
) -> ToolLoopResult:
    """Run the ReAct tool loop: LLM → tool calls → execute → append → repeat.

    Used by both chat_handler.py (interactive with callbacks) and ChatStrategy (batch).

    Args:
        ctx: Execution context with workspace, tools, policy, etc.
        messages: Message list to send to LLM (mutated in place).
        callbacks: Optional streaming callbacks for interactive mode.
        llm_kwargs: Dict with provider_name, api_key, model, base_url.
        max_iterations: Maximum tool loop iterations.
        llm_gateway: LLM gateway instance.
        tool_dispatcher: Tool dispatcher instance.
        result: Optional pre-created result object. When provided, callbacks can
            reference it to read accumulated state during execution.

    Returns:
        ToolLoopResult with response, thinking, tool calls, timeline.
    """
    if callbacks is None:
        callbacks = ToolLoopCallbacks()

    if result is None:
        result = ToolLoopResult(messages=messages)
    else:
        result.messages = messages
    # Use result.tool_calls directly so callers can observe live state
    all_tool_calls = result.tool_calls
    tool_calls_count = 0

    for iteration_index in range(max_iterations):
        if ctx.cancel_event.is_set():
            result.was_cancelled = True
            break

        # Compact older tool results to limit context growth in long loops
        if iteration_index > 0:
            _compact_old_tool_results(messages)

        response_this_turn = ""
        thinking_this_turn = ""
        thinking_started_at: float | None = None
        tool_calls_this_turn: list[dict[str, Any]] = []
        finish_reason = "stop"

        async for event in llm_gateway.stream_with_tools(
            messages=messages,
            tools=ctx.tools.openai_tools if ctx.tools else [],
            include_thinking=True,
            **llm_kwargs,
        ):
            if ctx.cancel_event.is_set():
                result.was_cancelled = True
                break

            event_type = event.get("type")
            if event_type == "thinking":
                chunk = event.get("content", "")
                if chunk:
                    if thinking_started_at is None:
                        thinking_started_at = time.monotonic()
                    result.full_thinking += chunk
                    thinking_this_turn += chunk
                    if callbacks.on_thinking:
                        await callbacks.on_thinking(chunk)
            elif event_type == "token":
                token = event.get("content", "")
                if token:
                    result.full_response += token
                    response_this_turn += token
                    if callbacks.on_token:
                        await callbacks.on_token(token)
            elif event_type == "tool_calls":
                tool_calls_this_turn = event.get("calls", [])
            elif event_type == "done":
                finish_reason = event.get("finish_reason", "stop")

        def _thinking_entry() -> dict[str, Any]:
            entry: dict[str, Any] = {"type": "thinking", "content": thinking_this_turn.strip()}
            if thinking_started_at is not None:
                entry["duration_ms"] = round((time.monotonic() - thinking_started_at) * 1000)
            return entry

        if result.was_cancelled:
            if thinking_this_turn.strip():
                result.timeline.append(_thinking_entry())
            break

        if not tool_calls_this_turn or finish_reason == "stop":
            if thinking_this_turn.strip():
                result.timeline.append(_thinking_entry())
            break

        if thinking_this_turn.strip():
            result.timeline.append(_thinking_entry())

        # Record intermediate response
        if response_this_turn.strip():
            result.intermediate_response_total += len(response_this_turn)
            result.timeline.append({"type": "intermediate_response", "content": response_this_turn.strip()})
            if callbacks.on_intermediate_response:
                await callbacks.on_intermediate_response(response_this_turn.strip())

        # Execute tool calls
        tool_results_for_messages: list[dict[str, Any]] = []
        for call in tool_calls_this_turn:
            if ctx.cancel_event.is_set():
                result.was_cancelled = True
                break

            call_id = call.get("id") or str(uuid.uuid4())
            fn_name = call.get("name", "")
            arguments = call.get("arguments") or {}
            tool_info = ctx.tools.fn_name_to_tool_info.get(fn_name) if ctx.tools else None
            if tool_info and tool_info.get("type") == "builtin":
                tool_id = tool_info["tool_id"]
            elif tool_info and tool_info.get("type") == "mcp":
                tool_id = f"mcp:{tool_info['server_id']}:{tool_info['tool_name']}"
            else:
                tool_id = _fn_name_to_tool_id(fn_name)

            tool_started_at = datetime.now(timezone.utc)
            timeline_entry: dict[str, Any] = {
                "type": "tool_call",
                "call_id": call_id,
                "tool_name": tool_id,
                "arguments": arguments,
                "hitl": None,
                "success": None,
                "output": None,
                "error": None,
                "duration_ms": None,
                "nested_timeline": None,
                "delegated_conversation_id": None,
            }
            result.timeline.append(timeline_entry)
            entry_idx = len(result.timeline) - 1
            all_tool_calls.append({"call_id": call_id, "tool_name": tool_id, "arguments": arguments})
            tool_calls_count += 1

            if callbacks.on_tool_start:
                await callbacks.on_tool_start(call_id, tool_id, arguments)

            # Rate limiting
            if ctx.rate_limiter:
                rate_error = ctx.rate_limiter.check()
                if rate_error:
                    result.timeline[entry_idx]["success"] = False
                    result.timeline[entry_idx]["error"] = rate_error
                    if callbacks.on_tool_result:
                        await callbacks.on_tool_result(call_id, tool_id, False, rate_error)
                    tool_results_for_messages.append({"tool_call_id": call_id, "content": f"Tool error: {rate_error}"})
                    continue

            # Policy evaluation
            risk_level = (tool_info.get("risk_level", "medium") if tool_info else "medium")
            hitl_note = ""

            # confirm_before_tools: force HITL for specific tools regardless of policy
            _force_hitl = False
            if ctx.agent_spec and ctx.agent_spec.confirm_before_tools:
                if tool_id in ctx.agent_spec.confirm_before_tools:
                    _force_hitl = True

            if ctx.policy_engine:
                # Use a dedicated session for policy/HITL DB operations so they
                # don't conflict with the main session that the LLM call may be
                # using concurrently (asyncpg allows only one op per connection).
                _sf = ctx.session_factory
                if _sf is None:
                    from openforge.db.postgres import AsyncSessionLocal
                    _sf = AsyncSessionLocal

                async with _sf() as _side_db:
                    policy_decision = await ctx.policy_engine.evaluate_async(
                        tool_id, risk_level, _side_db, agent_spec=ctx.agent_spec,
                    )

                if _force_hitl and policy_decision == "approve":
                    policy_decision = "hitl_required"

                if policy_decision == "blocked":
                    error = f"Tool '{tool_id}' is blocked by policy."
                    result.timeline[entry_idx]["success"] = False
                    result.timeline[entry_idx]["error"] = error
                    if callbacks.on_tool_result:
                        await callbacks.on_tool_result(call_id, tool_id, False, error)
                    tool_results_for_messages.append({"tool_call_id": call_id, "content": f"Tool error: {error}"})
                    continue

                if policy_decision == "hitl_required" and ctx.hitl_service:
                    action_summary = f"Agent wants to execute '{tool_id}' with: {json.dumps(arguments, default=str)[:300]}"
                    _agent_id = str(ctx.agent_spec.agent_id) if ctx.agent_spec else None
                    async with _sf() as _hitl_db:
                        hitl_request = await ctx.hitl_service.create_request(
                            _hitl_db,
                            workspace_id=ctx.workspace_id,
                            conversation_id=ctx.conversation_id,
                            tool_id=tool_id,
                            tool_input=arguments,
                            action_summary=action_summary,
                            risk_level=risk_level,
                            agent_id=_agent_id,
                        )
                    ctx.hitl_service.register_event(str(hitl_request.id))
                    result.timeline[entry_idx]["hitl"] = {
                        "hitl_id": str(hitl_request.id),
                        "action_summary": action_summary,
                        "risk_level": risk_level,
                        "status": "pending",
                        "resolution_note": None,
                    }
                    if callbacks.on_hitl_request:
                        await callbacks.on_hitl_request(call_id, str(hitl_request.id), action_summary, risk_level)

                    approved = await _wait_for_hitl(ctx.hitl_service, hitl_request.id, ctx.cancel_event)

                    from openforge.db.models import ApprovalRequestModel
                    async with _sf() as _hitl_db:
                        approval_row = await _hitl_db.get(ApprovalRequestModel, hitl_request.id)
                        if approval_row and approval_row.resolution_note:
                            hitl_note = approval_row.resolution_note

                    result.timeline[entry_idx]["hitl"]["status"] = "approved" if approved else "denied"
                    result.timeline[entry_idx]["hitl"]["resolution_note"] = hitl_note or None

                    if callbacks.on_hitl_resolved:
                        await callbacks.on_hitl_resolved(call_id, str(hitl_request.id), approved, hitl_note)

                    if ctx.cancel_event.is_set():
                        result.was_cancelled = True
                        break
                    if not approved:
                        denied_msg = "Tool execution denied by the user."
                        if hitl_note:
                            denied_msg += f" Guidance: {hitl_note}"
                        result.timeline[entry_idx]["success"] = False
                        result.timeline[entry_idx]["error"] = denied_msg
                        if callbacks.on_tool_result:
                            await callbacks.on_tool_result(call_id, tool_id, False, denied_msg)
                        tool_results_for_messages.append({"tool_call_id": call_id, "content": denied_msg})
                        continue

            # Execute tool
            if ctx.rate_limiter:
                ctx.rate_limiter.record()

            # For agent.invoke tools, inject forwarding context so subagent
            # events stream back to the root parent's timeline in real-time.
            if tool_id in ("platform.agent.invoke", "agent.invoke"):
                arguments["_call_id"] = call_id
                arguments["_scope_path"] = [entry_idx]
                # Propagate root forwarding context for deep nesting
                if ctx.root_execution_id:
                    arguments["_root_execution_id"] = ctx.root_execution_id
                    arguments["_root_conversation_id"] = ctx.root_conversation_id
                    arguments["_root_workspace_id"] = ctx.root_workspace_id
                    arguments["_call_id_path"] = ctx.call_id_path + [call_id]

            # Resolve workspace_id: explicit context > default > empty
            _ws_id = str(ctx.workspace_id) if ctx.workspace_id else (ctx.default_workspace_id or "")

            # Extract optional _timeout from arguments (seconds); None = no limit
            _tool_timeout: float | None = None
            if "_timeout" in arguments:
                try:
                    _tool_timeout = float(arguments.pop("_timeout"))
                except (ValueError, TypeError):
                    pass

            tool_result = await tool_dispatcher.execute(
                tool_id=tool_id,
                params=arguments,
                workspace_id=_ws_id,
                execution_id=ctx.execution_id,
                conversation_id=str(ctx.conversation_id or ""),
                agent_id=str(ctx.agent_spec.agent_id) if ctx.agent_spec else "",
                timeout=_tool_timeout,
            )
            finished_at = datetime.now(timezone.utc)
            duration_ms = max(1, int((finished_at - tool_started_at).total_seconds() * 1000))

            output_for_timeline = tool_result.get("output")
            if tool_result.get("success"):
                if output_for_timeline is None:
                    result_content = "Tool executed successfully with no output."
                elif isinstance(output_for_timeline, (dict, list)):
                    result_content = json.dumps(output_for_timeline, indent=2, default=str)
                else:
                    result_content = str(output_for_timeline)
            else:
                result_content = f"Tool error: {tool_result.get('error', 'Unknown error')}"
            result_content = _truncate_text(result_content, _MAX_LLM_TOOL_RESULT_CHARS)
            if hitl_note:
                result_content += f"\n\n[User guidance]: {hitl_note}"

            result.timeline[entry_idx]["success"] = tool_result.get("success", False)
            result.timeline[entry_idx]["output"] = _prepare_timeline_output(output_for_timeline)
            result.timeline[entry_idx]["error"] = tool_result.get("error")
            result.timeline[entry_idx]["duration_ms"] = duration_ms

            # Handle platform.agent.invoke special case
            if tool_id in ("platform.agent.invoke", "agent.invoke") and tool_result.get("success"):
                nested = output_for_timeline or {}
                if isinstance(nested, dict):
                    result.timeline[entry_idx]["output"] = nested.get("response", "")
                    result.timeline[entry_idx]["nested_timeline"] = nested.get("timeline", [])
                    result.timeline[entry_idx]["delegated_conversation_id"] = nested.get("conversation_id")
                    if nested.get("agent_name"):
                        result.timeline[entry_idx]["agent_name"] = nested["agent_name"]

            if callbacks.on_tool_result:
                _te = result.timeline[entry_idx]
                await callbacks.on_tool_result(call_id, tool_id, tool_result.get("success", False), tool_result.get("error"), _te.get("output"), _te.get("duration_ms"), _te.get("nested_timeline"), _te.get("delegated_conversation_id"))

            tool_results_for_messages.append({"tool_call_id": call_id, "content": result_content})

        if result.was_cancelled:
            break

        # Append assistant + tool messages
        assistant_msg: dict[str, Any] = {"role": "assistant", "content": response_this_turn or ""}
        assistant_msg["tool_calls"] = [
            {
                "id": call.get("id") or call.get("call_id", ""),
                "type": "function",
                "function": {
                    "name": _tool_id_to_fn_name(_fn_name_to_tool_id(call.get("name", ""))),
                    "arguments": json.dumps(call.get("arguments", {}), default=str),
                },
            }
            for call in tool_calls_this_turn
        ]
        messages.append(assistant_msg)
        for tool_msg in tool_results_for_messages:
            messages.append({
                "role": "tool",
                "tool_call_id": tool_msg["tool_call_id"],
                "content": tool_msg["content"],
            })

    result.tool_calls = all_tool_calls

    # Strip leaked raw tool_call XML tags that some models emit when the loop
    # exhausts max_iterations mid-call.
    if result.full_response and "<tool_call>" in result.full_response:
        import re
        result.full_response = re.sub(
            r"<tool_call>.*?</tool_call>", "", result.full_response, flags=re.DOTALL
        ).rstrip()
        # Also handle unclosed tags at the end
        idx = result.full_response.find("<tool_call>")
        if idx != -1:
            result.full_response = result.full_response[:idx].rstrip()

    return result


async def _wait_for_hitl(hitl_service: Any, hitl_id: UUID, cancel_event: asyncio.Event) -> bool:
    """Wait for HITL approval with cancellation support."""
    async def _wait_cancel() -> None:
        while not cancel_event.is_set():
            await asyncio.sleep(0.25)

    hitl_task = asyncio.create_task(hitl_service.wait_for_decision(str(hitl_id), timeout=300.0))
    cancel_task = asyncio.create_task(_wait_cancel())
    done, pending = await asyncio.wait({hitl_task, cancel_task}, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    if cancel_event.is_set():
        return False
    return hitl_task.result() if hitl_task in done else False
