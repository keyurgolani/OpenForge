"""Strategy execution loop — drives plan → step → aggregate lifecycle.

Nested iteration model:
- Outer loop: iterates through steps from strategy.plan()
- Inner loop: for loop-driven strategies (chat, watcher), the single step
  repeats via should_continue(). For plan-driven strategies (researcher,
  builder), each planned step runs once.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from openforge.db.models import RunStepModel
from openforge.runtime.events import (
    STEP_COMPLETED,
    STEP_FAILED,
    STEP_STARTED,
    STRATEGY_ACTION,
    STRATEGY_OBSERVATION,
    STRATEGY_THOUGHT,
    RuntimeEvent,
)
from openforge.runtime.lifecycle import finish_step, start_step

from .interface import AgentStrategy, RunContext, StepResult

logger = logging.getLogger("openforge.runtime.strategies.base_loop")


async def run_strategy_loop(strategy: AgentStrategy, ctx: RunContext) -> dict[str, Any]:
    """Drive the full strategy lifecycle: plan -> steps -> aggregate.

    Nested iteration model:
      Phase 1 (Plan): strategy.plan() returns step definitions.
      Phase 2 (Execute): For each planned step:
        - Inner loop repeats while should_continue() returns True.
        - Plan-driven strategies (researcher, builder): each step runs once.
        - Loop-driven strategies (chat, watcher): single step repeats as
          a ReAct tool loop until should_continue() returns False.
        - Safety limit: 100 total iterations across all steps.
      Phase 3 (Aggregate): strategy.aggregate() combines step results.

    Creates RunStepModel records, publishes events, creates checkpoints,
    and respects cancellation via ctx.cancel_event.
    """
    # Phase 1: Plan
    if ctx.cancel_event.is_set():
        return {"output": "", "cancelled": True}

    if ctx.event_publisher:
        await ctx.event_publisher.publish(
            RuntimeEvent(
                run_id=ctx.run_id,
                event_type=STRATEGY_THOUGHT,
                payload={"phase": "planning", "strategy": strategy.name},
            )
        )

    plan = await strategy.plan(ctx)
    steps = plan.get("steps", [{"action": "execute"}])

    if ctx.checkpoint_store:
        await ctx.checkpoint_store.create_checkpoint(
            run_id=ctx.run_id,
            state={"plan": plan, "phase": "planned"},
            checkpoint_type="after_plan",
        )

    # Phase 2: Execute steps
    # For each planned step, execute it. If should_continue returns True,
    # the step is re-executed (loop pattern, e.g. ChatStrategy).
    # All planned steps are always visited.
    step_index = 0
    max_total_iterations = 100  # safety limit for looping strategies
    total_iterations = 0

    for step_def in steps:
        if ctx.cancel_event.is_set():
            break

        while total_iterations < max_total_iterations:
            if ctx.cancel_event.is_set():
                break

            total_iterations += 1
            step_index += 1
            step_id = uuid.uuid4()

            # Create RunStepModel
            step_record = RunStepModel(
                id=step_id,
                run_id=ctx.run_id,
                step_index=step_index,
                node_key=step_def.get("action", f"step_{step_index}"),
                status="pending",
                input_snapshot=step_def,
            )
            ctx.db.add(step_record)
            await ctx.db.flush()

            # Start step
            start_step(step_record)
            await ctx.db.flush()

            if ctx.event_publisher:
                await ctx.event_publisher.publish(
                    RuntimeEvent(
                        run_id=ctx.run_id,
                        event_type=STEP_STARTED,
                        step_id=step_id,
                        node_key=step_record.node_key,
                        payload={"step_index": step_index, "step_def": step_def},
                    )
                )
                await ctx.event_publisher.publish(
                    RuntimeEvent(
                        run_id=ctx.run_id,
                        event_type=STRATEGY_ACTION,
                        step_id=step_id,
                        payload={"action": step_def.get("action", "execute"), "step_index": step_index},
                    )
                )

            if ctx.checkpoint_store:
                await ctx.checkpoint_store.create_checkpoint(
                    run_id=ctx.run_id,
                    state={"phase": "before_step", "step_index": step_index},
                    step_id=step_id,
                    checkpoint_type="before_step",
                )

            # Execute
            try:
                result = await strategy.execute_step(ctx, step_def)
                ctx.step_results.append(result)

                step_record.output_snapshot = {
                    "output": result.output[:2000] if result.output else "",
                    "tool_calls_count": len(result.tool_calls),
                    "artifacts_count": len(result.artifacts),
                }
                finish_step(step_record, "completed")
                await ctx.db.flush()

                if ctx.event_publisher:
                    await ctx.event_publisher.publish(
                        RuntimeEvent(
                            run_id=ctx.run_id,
                            event_type=STRATEGY_OBSERVATION,
                            step_id=step_id,
                            payload={
                                "output_preview": result.output[:500] if result.output else "",
                                "tool_calls_count": len(result.tool_calls),
                            },
                        )
                    )
                    await ctx.event_publisher.publish(
                        RuntimeEvent(
                            run_id=ctx.run_id,
                            event_type=STEP_COMPLETED,
                            step_id=step_id,
                            node_key=step_record.node_key,
                            payload={"step_index": step_index},
                        )
                    )

            except Exception as exc:
                logger.exception("Strategy step %d failed: %s", step_index, exc)
                finish_step(step_record, "failed", error_message=str(exc))
                await ctx.db.flush()

                if ctx.event_publisher:
                    await ctx.event_publisher.publish(
                        RuntimeEvent(
                            run_id=ctx.run_id,
                            event_type=STEP_FAILED,
                            step_id=step_id,
                            node_key=step_record.node_key,
                            payload={"step_index": step_index, "error": str(exc)},
                        )
                    )
                raise

            if ctx.checkpoint_store:
                await ctx.checkpoint_store.create_checkpoint(
                    run_id=ctx.run_id,
                    state={"phase": "after_step", "step_index": step_index},
                    step_id=step_id,
                    checkpoint_type="after_step",
                )

            # should_continue controls whether to re-execute THIS step
            if not strategy.should_continue(ctx, result):
                break  # Move to next planned step

    # Phase 3: Aggregate
    if ctx.cancel_event.is_set():
        return {"output": "", "cancelled": True}

    if ctx.event_publisher:
        await ctx.event_publisher.publish(
            RuntimeEvent(
                run_id=ctx.run_id,
                event_type=STRATEGY_THOUGHT,
                payload={"phase": "aggregating", "strategy": strategy.name},
            )
        )

    output = await strategy.aggregate(ctx)
    return output
