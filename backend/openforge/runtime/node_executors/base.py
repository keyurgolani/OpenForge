"""Base executor contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


class NodeExecutionError(Exception):
    """Structured node execution failure."""

    def __init__(self, message: str, *, code: str = "node_execution_failed", retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(slots=True)
class NodeExecutionContext:
    """Context passed to executors."""

    run: Any
    workflow: dict[str, Any]
    workflow_version: dict[str, Any]
    node: dict[str, Any]
    state: dict[str, Any]
    step_index: int
    coordinator: Any
    step_id: UUID | None = None
    capability_bundle: dict[str, Any] | None = None


@dataclass(slots=True)
class NodeExecutionResult:
    """Structured executor result."""

    state: dict[str, Any]
    output: dict[str, Any] = field(default_factory=dict)
    next_edge_type: str = "success"
    interrupt: bool = False
    interrupt_status: str | None = None
    approval_request_id: UUID | None = None
    emitted_artifact_ids: list[UUID] = field(default_factory=list)
    spawned_run_id: UUID | None = None
    spawned_run_ids: list[UUID] = field(default_factory=list)


class BaseNodeExecutor:
    """Executor base class."""

    supported_types: tuple[str, ...] = ()

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        raise NotImplementedError
