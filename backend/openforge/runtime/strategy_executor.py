"""Strategy executor — creates runs and drives strategy lifecycle."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import RunModel
from openforge.domains.agents.compiled_spec import AgentRuntimeConfig
from openforge.runtime.events import (
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_STARTED,
    RuntimeEvent,
)
from openforge.runtime.lifecycle import transition_run
from openforge.runtime.strategies.base_loop import run_strategy_loop
from openforge.runtime.strategies.interface import RunContext
from openforge.runtime.strategies.registry import strategy_registry

if TYPE_CHECKING:
    from openforge.runtime.event_publisher import EventPublisher
    from openforge.runtime.checkpoint_store import CheckpointStore
    from openforge.integrations.tools.dispatcher import ToolDispatcher
    from openforge.core.llm_gateway import LLMGateway
    from openforge.runtime.hitl import HITLService
    from openforge.runtime.policy import PolicyEngine

logger = logging.getLogger("openforge.runtime.strategy_executor")


class StrategyExecutor:
    """Executes an agent's compiled spec via the strategy plugin system."""

    def __init__(
        self,
        db: AsyncSession,
        event_publisher: EventPublisher | None = None,
        checkpoint_store: CheckpointStore | None = None,
        tool_dispatcher: ToolDispatcher | None = None,
        llm_gateway: LLMGateway | None = None,
        hitl_service: HITLService | None = None,
        policy_engine: PolicyEngine | None = None,
    ) -> None:
        self.db = db
        self.event_publisher = event_publisher
        self.checkpoint_store = checkpoint_store
        self.tool_dispatcher = tool_dispatcher
        self.llm_gateway = llm_gateway
        self.hitl_service = hitl_service
        self.policy_engine = policy_engine

    async def execute(
        self,
        spec: AgentRuntimeConfig,
        input_payload: dict[str, Any],
        *,
        workspace_id: UUID | None = None,
        run_id: UUID | None = None,
        run_type: str = "strategy",
    ) -> dict[str, Any]:
        """Execute a strategy run.

        1. Create RunModel if run_id is None
        2. Lookup strategy from registry (fallback to "chat")
        3. Build RunContext
        4. Transition run → running, publish RUN_STARTED
        5. Call run_strategy_loop
        6. Transition run → completed, publish RUN_COMPLETED
        7. Return output

        On error: transition → failed, publish RUN_FAILED.
        """
        # 1. Create or load RunModel
        if run_id is None:
            run_id = uuid.uuid4()

        run = await self.db.get(RunModel, run_id)
        if run is None:
            run = RunModel(
                id=run_id,
                run_type=run_type,
                workspace_id=workspace_id or uuid.uuid4(),
                status="pending",
                input_payload=input_payload,
                composite_metadata={
                    "agent_id": str(spec.agent_id),
                    "agent_slug": spec.agent_slug,
                    "strategy": spec.strategy,
                },
            )
            self.db.add(run)
            await self.db.flush()

        # 2. Lookup strategy
        strategy = strategy_registry.get(spec.strategy)
        if strategy is None:
            logger.warning("Strategy '%s' not found, falling back to 'chat'", spec.strategy)
            strategy = strategy_registry.get("chat")
        if strategy is None:
            raise RuntimeError(f"No strategy available for '{spec.strategy}' and no 'chat' fallback")

        # 3. Build RunContext
        cancel_event = asyncio.Event()
        messages = input_payload.get("messages", [])
        if not messages:
            user_msg = input_payload.get("message") or input_payload.get("instruction", "")
            if user_msg:
                messages = [{"role": "user", "content": user_msg}]

        # Resolve LLM provider into ProviderConfig
        provider_config = None
        if workspace_id is not None:
            try:
                from openforge.services.llm_service import llm_service
                from openforge.runtime.provider_config import ProviderConfig

                provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                    self.db,
                    workspace_id,
                    provider_id=spec.provider_name,
                    model_override=spec.model_name,
                )
                provider_config = ProviderConfig(
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                )
            except Exception as exc:
                logger.warning("Failed to resolve LLM provider for run %s: %s", run_id, exc)

        ctx = RunContext(
            run_id=run_id,
            agent_spec=spec,
            db=self.db,
            workspace_id=workspace_id,
            input_payload=input_payload,
            event_publisher=self.event_publisher,
            checkpoint_store=self.checkpoint_store,
            tool_dispatcher=self.tool_dispatcher,
            llm_gateway=self.llm_gateway,
            provider_config=provider_config,
            cancel_event=cancel_event,
            messages=messages,
        )

        try:
            # 4. Transition to running
            transition_run(run, "running")
            await self.db.commit()

            if self.event_publisher:
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run_id,
                        event_type=RUN_STARTED,
                        payload={
                            "strategy": strategy.name,
                            "agent_slug": spec.agent_slug,
                        },
                    )
                )

            # 5. Execute strategy loop
            output = await run_strategy_loop(strategy, ctx)

            # 6. Transition to completed
            transition_run(run, "completed")
            run.output_payload = output
            await self.db.commit()

            if self.event_publisher:
                await self.event_publisher.publish(
                    RuntimeEvent(
                        run_id=run_id,
                        event_type=RUN_COMPLETED,
                        payload={"output_preview": str(output.get("output", ""))[:500]},
                    )
                )

            return output

        except Exception as exc:
            logger.exception("Strategy execution failed for run %s: %s", run_id, exc)

            try:
                transition_run(run, "failed", error_message=str(exc))
                await self.db.commit()
            except Exception:
                logger.warning("Failed to transition run %s to failed state", run_id)

            if self.event_publisher:
                try:
                    await self.event_publisher.publish(
                        RuntimeEvent(
                            run_id=run_id,
                            event_type=RUN_FAILED,
                            payload={"error": str(exc)[:500]},
                        )
                    )
                except Exception:
                    pass

            raise
