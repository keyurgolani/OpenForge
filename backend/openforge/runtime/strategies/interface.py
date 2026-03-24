"""Strategy plugin interface and runtime context types."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable, TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.domains.agents.compiled_spec import AgentRuntimeConfig

if TYPE_CHECKING:
    from openforge.runtime.provider_config import ProviderConfig
    from openforge.runtime.event_publisher import EventPublisher
    from openforge.runtime.checkpoint_store import CheckpointStore
    from openforge.integrations.tools.dispatcher import ToolDispatcher
    from openforge.core.llm_gateway import LLMGateway


@dataclass
class StepResult:
    """Result of a single strategy step execution."""

    output: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    should_continue: bool = False


@dataclass
class RunContext:
    """Mutable execution context passed to strategy methods."""

    run_id: UUID
    agent_spec: AgentRuntimeConfig
    db: AsyncSession
    workspace_id: UUID | None
    input_payload: dict[str, Any]
    state: dict[str, Any] = field(default_factory=dict)
    event_publisher: EventPublisher | None = None
    checkpoint_store: CheckpointStore | None = None
    tool_dispatcher: ToolDispatcher | None = None
    llm_gateway: LLMGateway | None = None
    provider_config: ProviderConfig | None = None
    step_results: list[StepResult] = field(default_factory=list)
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    messages: list[dict[str, Any]] = field(default_factory=list)


@runtime_checkable
class AgentStrategy(Protocol):
    """Protocol that all strategy plugins must implement.

    Default implementations are provided for plan, should_continue, and
    aggregate so that simple strategies only need to override execute_step.

    should_continue() semantics:
    - For plan-driven strategies (researcher, builder): return False to advance
      to the next planned step. The outer loop iterates through all steps in plan().
    - For loop-driven strategies (chat, watcher): return True to repeat the single
      step (the main LLM/tool loop). Return False to terminate.
    """

    @property
    def name(self) -> str:
        ...

    async def plan(self, ctx: RunContext) -> dict[str, Any]:
        ...

    async def execute_step(self, ctx: RunContext, step: dict[str, Any]) -> StepResult:
        ...

    def should_continue(self, ctx: RunContext, latest: StepResult) -> bool:
        ...

    async def aggregate(self, ctx: RunContext) -> dict[str, Any]:
        ...


class BaseStrategy:
    """Base class with sensible defaults for plan/should_continue/aggregate.

    Concrete strategies only need to override execute_step(). The defaults:
    - plan(): returns a single {"action": "execute"} step
    - should_continue(): delegates to StepResult.should_continue
    - aggregate(): returns the last step's output and artifacts
    """

    @property
    def name(self) -> str:
        raise NotImplementedError

    async def plan(self, ctx: RunContext) -> dict[str, Any]:
        return {"steps": [{"action": "execute"}]}

    async def execute_step(self, ctx: RunContext, step: dict[str, Any]) -> StepResult:
        raise NotImplementedError

    def should_continue(self, ctx: RunContext, latest: StepResult) -> bool:
        return latest.should_continue

    async def aggregate(self, ctx: RunContext) -> dict[str, Any]:
        if ctx.step_results:
            last = ctx.step_results[-1]
            return {"output": last.output, "artifacts": last.artifacts}
        return {"output": ""}
