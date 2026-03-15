"""Reduce executor."""

from __future__ import annotations

from openforge.runtime.merge_engine import reduce_collection

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class ReduceNodeExecutor(BaseNodeExecutor):
    """Reduce normalized branch outputs into a final parent value."""

    supported_types = ("reduce",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        source_key = config.get("source_key", "joined_branches")
        output_key = config.get("output_key", "reduced_output")
        result = reduce_collection(
            list(state.get(source_key, []) or []),
            strategy=config.get("strategy", "collect"),
            field=config.get("field"),
            separator=config.get("separator", "\n"),
        )
        state[output_key] = result
        return NodeExecutionResult(state=state, output={output_key: result})
