"""Chat strategy — single-step ReAct tool loop."""

from __future__ import annotations

import logging
from typing import Any

from .interface import BaseStrategy, RunContext, StepResult

logger = logging.getLogger("openforge.runtime.strategies.chat")


class ChatStrategy(BaseStrategy):
    """Essential strategy for interactive and background chat.

    Implements a single-step ReAct tool loop via tool_loop.execute_tool_loop():
    1. Assemble messages from ctx.messages + system prompt from agent_spec
    2. Load tools via tool_dispatcher, filtered by agent_spec
    3. Delegate to execute_tool_loop() for LLM + tool dispatch with
       HITL, policy evaluation, rate limiting, and confirm_before_tools
    4. Return result; should_continue=True if tool calls were made
    """

    @property
    def name(self) -> str:
        return "chat"

    async def plan(self, ctx: RunContext) -> dict[str, Any]:
        return {"steps": [{"action": "chat_loop"}]}

    async def execute_step(self, ctx: RunContext, step: dict[str, Any]) -> StepResult:
        spec = ctx.agent_spec
        max_iterations = ctx.state.get("max_iterations", 20)
        iteration = ctx.state.get("iteration", 0)

        if iteration >= max_iterations:
            return StepResult(
                output="Maximum iterations reached.",
                should_continue=False,
            )

        # Build messages with system prompt
        messages = list(ctx.messages)
        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": spec.system_prompt or "You are a helpful assistant."})

        # Load tools via tool_dispatcher, filtered by agent spec
        from openforge.runtime.chat_handler import LoadedTools

        tools: LoadedTools | None = None
        if spec.tools_enabled and ctx.tool_dispatcher:
            try:
                raw_tools = await ctx.tool_dispatcher.list_tools()
                if spec.allowed_tools is not None:
                    allowed = set(spec.allowed_tools)
                    raw_tools = [t for t in raw_tools if t["id"] in allowed]

                from openforge.runtime.chat_handler import _tool_id_to_fn_name, _tools_to_openai_schema

                fn_name_to_tool_info: dict[str, dict[str, Any]] = {}
                for tool in raw_tools:
                    fn_name_to_tool_info[_tool_id_to_fn_name(tool["id"])] = {
                        "type": "builtin",
                        "tool_id": tool["id"],
                        "risk_level": tool.get("risk_level", "low"),
                    }
                openai_tools = _tools_to_openai_schema(raw_tools)
                tools = LoadedTools(openai_tools=openai_tools, fn_name_to_tool_info=fn_name_to_tool_info)
            except Exception as exc:
                logger.warning("Failed to load tools for chat strategy: %s", exc)

        if not ctx.llm_gateway:
            return StepResult(output="No LLM gateway configured.", should_continue=False)

        # Resolve LLM provider
        provider_config = getattr(ctx, "provider_config", None)
        if provider_config is not None:
            llm_kwargs = {
                "provider_name": provider_config.provider_name,
                "api_key": provider_config.api_key,
                "model": provider_config.model,
                "base_url": provider_config.base_url,
            }
        else:
            from openforge.services.llm_service import llm_service
            provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                ctx.db,
                ctx.workspace_id,
                provider_id=spec.provider_name,
                model_override=spec.model_name,
            )
            llm_kwargs = {
                "provider_name": provider_name,
                "api_key": api_key,
                "model": model,
                "base_url": base_url,
            }

        # Build ToolLoopContext and delegate to execute_tool_loop
        from openforge.runtime.tool_loop import ToolLoopContext, execute_tool_loop
        from openforge.runtime.policy import ToolCallRateLimiter, policy_engine
        from openforge.runtime.hitl import hitl_service

        rate_limiter = ToolCallRateLimiter(
            max_per_minute=30,
            max_per_execution=200,
        )

        loop_ctx = ToolLoopContext(
            workspace_id=ctx.workspace_id,
            conversation_id=None,
            execution_id=str(ctx.run_id),
            agent_spec=spec,
            tools=tools,
            rate_limiter=rate_limiter,
            policy_engine=policy_engine,
            hitl_service=hitl_service,
            cancel_event=ctx.cancel_event,
            db=None,
        )

        result = await execute_tool_loop(
            ctx=loop_ctx,
            messages=messages,
            callbacks=None,
            llm_kwargs=llm_kwargs,
            max_iterations=max_iterations - iteration,
            llm_gateway=ctx.llm_gateway,
            tool_dispatcher=ctx.tool_dispatcher,
        )

        # Sync messages back to ctx for next iteration
        ctx.messages.clear()
        ctx.messages.extend(messages)

        has_tool_calls = bool(result.tool_calls)
        ctx.state["iteration"] = iteration + (len([e for e in result.timeline if e.get("type") == "thinking"]) or 1)

        return StepResult(
            output=result.full_response,
            tool_calls=result.tool_calls,
            should_continue=has_tool_calls and not result.was_cancelled,
        )

    def should_continue(self, ctx: RunContext, latest: StepResult) -> bool:
        max_iterations = ctx.state.get("max_iterations", 20)
        iteration = ctx.state.get("iteration", 0)
        if iteration >= max_iterations:
            return False
        return latest.should_continue
