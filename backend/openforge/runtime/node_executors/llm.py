"""LLM node executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class LLMNodeExecutor(BaseNodeExecutor):
    """Bounded Phase 9 LLM executor surface.

    This first pass intentionally stays deterministic unless the node config
    explicitly opts into a live response pathway later.
    """

    supported_types = ("llm",)

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {})
        output_key = config.get("output_key", "llm_output")
        if config.get("static_response") is not None:
            state[output_key] = str(config["static_response"]).format(**state)
        elif config.get("response_template") is not None:
            state[output_key] = str(config["response_template"]).format(**state)
        else:
            state[output_key] = ""
        return NodeExecutionResult(state=state, output={output_key: state[output_key]})
