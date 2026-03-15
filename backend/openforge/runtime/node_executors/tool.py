"""Tool node executor.

Integrates with Phase 3 policy evaluation and the tool server for live
tool dispatch.  Retains deterministic operations (template, set_value,
append_list) for testing and simple transform workflows.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionError, NodeExecutionResult

logger = logging.getLogger("openforge.runtime.node_executors.tool")


class ToolNodeExecutor(BaseNodeExecutor):
    """Tool/transform node executor with policy and dispatch integration.

    Execution modes (selected by node config ``operation``):

    * **template / set_value / append_list** -- deterministic operations for
      testing and simple state transforms.  No external call is made.
    * **call_tool** -- resolves the tool through the tool server, evaluates
      policy/rate-limits via the PolicyEngine, calls the tool, captures
      output, and emits structured results.
    """

    supported_types = ("tool", "transform")

    def __init__(
        self,
        *,
        policy_engine=None,
        rate_limiter=None,
    ) -> None:
        self._policy_engine = policy_engine
        self._rate_limiter = rate_limiter

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        config = context.node.get("config", {}) or {}
        operation = config.get("operation", "template")
        state = dict(context.state)

        # ---- deterministic operations (backwards compatible) ---- #
        if operation == "template":
            template = config.get("template", "")
            output_key = config.get("output_key", "result")
            state[output_key] = template.format(**state)
            return NodeExecutionResult(state=state, output={output_key: state[output_key]})

        if operation == "set_value":
            output_key = config["output_key"]
            state[output_key] = config.get("value")
            return NodeExecutionResult(state=state, output={output_key: state[output_key]})

        if operation == "append_list":
            output_key = config["output_key"]
            state.setdefault(output_key, [])
            state[output_key].append(config.get("value"))
            return NodeExecutionResult(state=state, output={output_key: state[output_key]})

        # ---- live tool dispatch ---- #
        if operation == "call_tool":
            return await self._execute_tool_call(context, state, config)

        raise NodeExecutionError(
            f"Unsupported tool node operation '{operation}'",
            code="unsupported_tool_operation",
        )

    # ------------------------------------------------------------------ #
    # Live tool dispatch
    # ------------------------------------------------------------------ #

    async def _execute_tool_call(
        self,
        context: NodeExecutionContext,
        state: dict[str, Any],
        config: dict[str, Any],
    ) -> NodeExecutionResult:
        tool_name = config.get("tool_name")
        if not tool_name:
            raise NodeExecutionError("tool_name is required for call_tool operation", code="missing_tool_name")

        # Build tool arguments from config or state
        tool_args = self._build_tool_args(state, config)
        output_key = config.get("output_key", "tool_result")
        risk_level = config.get("risk_level", "read_only")

        # Evaluate policy
        await self._evaluate_tool_policy(context, tool_name, risk_level)

        # Check rate limit
        self._check_rate_limit()

        # Call tool
        result = await self._dispatch_tool(context, tool_name, tool_args, config)

        # Capture and optionally truncate output
        processed = self._process_tool_output(result, config)

        state[output_key] = processed
        return NodeExecutionResult(state=state, output={output_key: processed})

    def _build_tool_args(
        self, state: dict[str, Any], config: dict[str, Any]
    ) -> dict[str, Any]:
        """Build tool arguments from config and state."""
        args = dict(config.get("tool_args", {}) or {})

        # Support argument templates referencing state
        arg_mapping = config.get("arg_mapping")
        if arg_mapping:
            for arg_key, state_ref in arg_mapping.items():
                if isinstance(state_ref, str):
                    # Dot-notation path resolution
                    current: Any = state
                    for part in state_ref.split("."):
                        if isinstance(current, dict) and part in current:
                            current = current[part]
                        else:
                            current = None
                            break
                    args[arg_key] = current
                else:
                    args[arg_key] = state_ref

        return args

    async def _evaluate_tool_policy(
        self,
        context: NodeExecutionContext,
        tool_name: str,
        risk_level: str,
    ) -> None:
        """Evaluate tool access through Phase 3 policy engine."""
        if self._policy_engine is None:
            return

        db = getattr(context.coordinator, "db", None)
        if db is not None and hasattr(self._policy_engine, "evaluate_async"):
            decision = await self._policy_engine.evaluate_async(
                tool_name, risk_level, db
            )
        else:
            decision = self._policy_engine.evaluate(tool_name, risk_level)

        if decision == "blocked":
            raise NodeExecutionError(
                f"Tool '{tool_name}' blocked by policy",
                code="policy_blocked",
            )

        if decision == "hitl_required":
            # Tool requires approval - this should be handled by an
            # upstream approval node in the workflow, but we log it
            logger.warning(
                "Tool '%s' requires HITL approval but no approval node precedes this tool node",
                tool_name,
            )

    def _check_rate_limit(self) -> None:
        """Check rate limits via the rate limiter."""
        if self._rate_limiter is None:
            return
        error = self._rate_limiter.check()
        if error:
            raise NodeExecutionError(error, code="tool_rate_limited", retryable=True)
        self._rate_limiter.record()

    async def _dispatch_tool(
        self,
        context: NodeExecutionContext,
        tool_name: str,
        tool_args: dict[str, Any],
        config: dict[str, Any],
    ) -> Any:
        """Dispatch tool call to the tool server via httpx."""
        try:
            import httpx
        except ImportError:
            raise NodeExecutionError(
                "httpx is required for live tool dispatch", code="missing_dependency"
            )

        tool_server_url = config.get("tool_server_url", "http://tool-server:8001")
        timeout = config.get("timeout", 60)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{tool_server_url}/tools/{tool_name}/execute",
                    json={"arguments": tool_args},
                )
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException as exc:
            raise NodeExecutionError(
                f"Tool '{tool_name}' timed out", code="tool_timeout", retryable=True
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise NodeExecutionError(
                f"Tool '{tool_name}' returned HTTP {exc.response.status_code}",
                code="tool_call_failed",
            ) from exc
        except Exception as exc:
            raise NodeExecutionError(
                f"Tool '{tool_name}' dispatch failed: {exc}",
                code="tool_call_failed",
            ) from exc

    def _process_tool_output(
        self, result: Any, config: dict[str, Any]
    ) -> Any:
        """Process and optionally truncate tool output."""
        max_output_length = config.get("max_output_length")

        if max_output_length and isinstance(result, str) and len(result) > max_output_length:
            return result[:max_output_length] + "... [truncated]"

        if max_output_length and isinstance(result, dict):
            content = result.get("content") or result.get("result") or result.get("output")
            if isinstance(content, str) and len(content) > max_output_length:
                result = dict(result)
                key = "content" if "content" in result else ("result" if "result" in result else "output")
                result[key] = content[:max_output_length] + "... [truncated]"

        return result
