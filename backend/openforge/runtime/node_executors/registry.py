"""Node executor registry."""

from __future__ import annotations

from typing import Any

from .approval import ApprovalNodeExecutor
from .artifact import ArtifactNodeExecutor
from .llm import LLMNodeExecutor
from .router import RouterNodeExecutor
from .subworkflow import SubworkflowNodeExecutor
from .tool import ToolNodeExecutor


class NodeExecutorRegistry:
    """Register and resolve executors by node type."""

    def __init__(self):
        self._executors: dict[str, Any] = {}

    def register(self, node_type: str, executor: Any) -> None:
        self._executors[node_type] = executor

    def resolve(self, node_type: str):
        executor = self._executors.get(node_type)
        if executor is None:
            raise KeyError(f"No executor registered for node type '{node_type}'")
        return executor


def build_default_registry(*, artifact_service, approval_service) -> NodeExecutorRegistry:
    registry = NodeExecutorRegistry()
    registry.register("tool", ToolNodeExecutor())
    registry.register("router", RouterNodeExecutor())
    registry.register("approval", ApprovalNodeExecutor(approval_service))
    registry.register("artifact", ArtifactNodeExecutor(artifact_service))
    registry.register("subworkflow", SubworkflowNodeExecutor())
    registry.register("llm", LLMNodeExecutor())
    registry.register("transform", ToolNodeExecutor())
    registry.register("join", ToolNodeExecutor())
    return registry
