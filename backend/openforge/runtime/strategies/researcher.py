"""Researcher strategy — demonstrates the full plan → step → aggregate loop."""

from __future__ import annotations

import json
import logging
from typing import Any

from .interface import BaseStrategy, RunContext, StepResult

logger = logging.getLogger("openforge.runtime.strategies.researcher")


def _resolve_llm_kwargs(ctx: RunContext) -> dict[str, Any] | None:
    """Resolve LLM kwargs from provider_config or inline fallback."""
    if ctx.provider_config is not None:
        return {
            "provider_name": ctx.provider_config.provider_name,
            "api_key": ctx.provider_config.api_key,
            "model": ctx.provider_config.model,
            "base_url": ctx.provider_config.base_url,
        }
    return None


async def _resolve_llm_kwargs_fallback(ctx: RunContext) -> dict[str, Any]:
    """Fallback: resolve LLM provider inline if provider_config is not set."""
    if ctx.provider_config is not None:
        return {
            "provider_name": ctx.provider_config.provider_name,
            "api_key": ctx.provider_config.api_key,
            "model": ctx.provider_config.model,
            "base_url": ctx.provider_config.base_url,
        }
    from openforge.services.llm_service import llm_service

    provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
        ctx.db,
        ctx.workspace_id,
        provider_id=ctx.agent_spec.provider_name,
        model_override=ctx.agent_spec.model_name,
    )
    return {
        "provider_name": provider_name,
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
    }


class ResearcherStrategy(BaseStrategy):
    """Multi-step research strategy.

    - plan(): Calls LLM to decompose the input into research sub-questions.
    - execute_step(): Uses retrieval tools + LLM to gather findings per step.
    - should_continue(): Always False (plan-driven, not loop-driven).
    - aggregate(): Calls LLM to synthesize all step results into a final answer.
    """

    @property
    def name(self) -> str:
        return "researcher"

    async def plan(self, ctx: RunContext) -> dict[str, Any]:
        user_input = ctx.input_payload.get("message", ctx.input_payload.get("instruction", ""))
        if not user_input:
            return {"steps": [{"action": "research", "query": "general research"}]}

        if not ctx.llm_gateway:
            return {"steps": [{"action": "research", "query": user_input}]}

        llm_kwargs = await _resolve_llm_kwargs_fallback(ctx)

        planner_prompt = (
            "You are a research planner. Given the user's question, decompose it into "
            "2-5 specific research sub-questions. Return ONLY a JSON array of strings, "
            "each being a focused research query. No explanation.\n\n"
            f"User question: {user_input}"
        )

        try:
            response = await ctx.llm_gateway.chat(
                messages=[{"role": "user", "content": planner_prompt}],
                **llm_kwargs,
            )
            queries = json.loads(response.strip().strip("`").strip())
            if isinstance(queries, list) and queries:
                return {
                    "steps": [{"action": "research", "query": q} for q in queries[:5]]
                }
        except Exception as exc:
            logger.warning("Research planner failed, falling back to single step: %s", exc)

        return {"steps": [{"action": "research", "query": user_input}]}

    async def execute_step(self, ctx: RunContext, step: dict[str, Any]) -> StepResult:
        query = step.get("query", "")
        if not query:
            return StepResult(output="No query provided.", should_continue=False)

        if not ctx.llm_gateway:
            return StepResult(output="No LLM gateway configured.", should_continue=False)

        llm_kwargs = await _resolve_llm_kwargs_fallback(ctx)

        # Load retrieval tools if available
        tools_schema: list[dict[str, Any]] = []
        tool_map: dict[str, dict[str, Any]] = {}
        if ctx.agent_spec.tools_enabled and ctx.tool_dispatcher:
            try:
                raw_tools = await ctx.tool_dispatcher.list_tools()
                # Filter to retrieval-related tools
                retrieval_categories = {"knowledge", "search", "retrieval", "agent"}
                raw_tools = [t for t in raw_tools if t.get("category") in retrieval_categories]

                for tool in raw_tools:
                    fn_name = tool["id"].replace(".", "__")
                    tool_map[fn_name] = {"tool_id": tool["id"]}
                    tools_schema.append({
                        "type": "function",
                        "function": {
                            "name": fn_name,
                            "description": tool["description"],
                            "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
                        },
                    })
            except Exception as exc:
                logger.warning("Failed to load retrieval tools: %s", exc)

        research_prompt = (
            f"Research the following question thoroughly and provide detailed findings:\n\n{query}\n\n"
            "Use available tools to search for relevant information. "
            "Provide a comprehensive answer with key findings."
        )

        messages = [
            {"role": "system", "content": ctx.agent_spec.system_prompt or "You are a thorough research assistant."},
            {"role": "user", "content": research_prompt},
        ]

        # Single-pass tool loop for research
        full_response = ""
        tool_calls_executed: list[dict[str, Any]] = []

        for _ in range(5):  # max 5 tool iterations per research step
            if ctx.cancel_event.is_set():
                break

            tool_calls: list[dict[str, Any]] = []
            response_text = ""

            async for event in ctx.llm_gateway.stream_with_tools(
                messages=messages,
                tools=tools_schema,
                include_thinking=False,
                **llm_kwargs,
            ):
                if ctx.cancel_event.is_set():
                    break
                etype = event.get("type")
                if etype == "token":
                    response_text += event.get("content", "")
                elif etype == "tool_calls":
                    tool_calls = event.get("calls", [])

            if not tool_calls:
                full_response = response_text
                break

            # Execute tools
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": response_text or ""}
            assistant_msg["tool_calls"] = [
                {
                    "id": c.get("id", ""),
                    "type": "function",
                    "function": {
                        "name": c.get("name", ""),
                        "arguments": json.dumps(c.get("arguments", {}), default=str),
                    },
                }
                for c in tool_calls
            ]
            messages.append(assistant_msg)

            for call in tool_calls:
                fn_name = call.get("name", "")
                arguments = call.get("arguments") or {}
                info = tool_map.get(fn_name)
                tool_id = info["tool_id"] if info else fn_name.replace("__", ".")

                try:
                    result = await ctx.tool_dispatcher.execute(
                        tool_id=tool_id,
                        params=arguments,
                        workspace_id=str(ctx.workspace_id) if ctx.workspace_id else "",
                        execution_id=str(ctx.run_id),
                        conversation_id="",
                    )
                    content = json.dumps(result.get("output"), default=str)[:4000] if result.get("success") else f"Error: {result.get('error')}"
                except Exception as exc:
                    content = f"Tool error: {exc}"

                tool_calls_executed.append({
                    "tool_name": tool_id,
                    "arguments": arguments,
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.get("id", ""),
                    "content": content,
                })

            full_response = response_text

        return StepResult(
            output=full_response,
            tool_calls=tool_calls_executed,
            should_continue=False,
        )

    def should_continue(self, ctx: RunContext, latest: StepResult) -> bool:
        # Plan-driven: never loop, always advance to next planned step
        return False

    async def aggregate(self, ctx: RunContext) -> dict[str, Any]:
        if not ctx.step_results:
            return {"output": "No research results collected."}

        if len(ctx.step_results) == 1:
            return {"output": ctx.step_results[0].output}

        if not ctx.llm_gateway:
            combined = "\n\n---\n\n".join(r.output for r in ctx.step_results if r.output)
            return {"output": combined}

        llm_kwargs = await _resolve_llm_kwargs_fallback(ctx)

        findings = "\n\n".join(
            f"### Finding {i + 1}\n{r.output}" for i, r in enumerate(ctx.step_results) if r.output
        )

        synthesis_prompt = (
            "You are a research synthesizer. Below are findings from multiple research queries. "
            "Synthesize them into a comprehensive, well-structured answer.\n\n"
            f"{findings}"
        )

        try:
            response = await ctx.llm_gateway.chat(
                messages=[{"role": "user", "content": synthesis_prompt}],
                **llm_kwargs,
            )
            return {"output": response}
        except Exception as exc:
            logger.warning("Research synthesis failed: %s", exc)
            return {"output": findings}
