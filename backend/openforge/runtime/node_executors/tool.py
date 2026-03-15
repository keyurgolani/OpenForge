"""Tool node executor."""

from __future__ import annotations

from typing import Any

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionError, NodeExecutionResult


class ToolNodeExecutor(BaseNodeExecutor):
    """Deterministic first-pass tool/transform executor."""

    supported_types = ("tool", "transform", "join")

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        config = context.node.get("config", {})
        operation = config.get("operation", "template")
        state = dict(context.state)

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

        raise NodeExecutionError(f"Unsupported tool node operation '{operation}'", code="unsupported_tool_operation")
