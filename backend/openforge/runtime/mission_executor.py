"""Mission cycle executor -- drives a single OODA cycle for a mission.

Called by Celery worker task when a mission cycle fires. Loads the mission
and its autonomous agent, assembles a context-rich system prompt, runs
the agent through the standard tool loop, then parses the structured
output to update cycle and mission state.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentDefinitionVersionModel,
    AgentModel,
    Knowledge,
    MissionCycleModel,
    MissionModel,
    RunModel,
    Workspace,
)
from openforge.domains.agents.compiled_spec import (
    AgentRuntimeConfig,
    build_runtime_config_from_snapshot,
)
from openforge.runtime.prompt_context import build_mission_context, build_preamble, build_postamble

logger = logging.getLogger("openforge.runtime.mission_executor")


# ---------------------------------------------------------------------------
# Mission event broadcasting helpers
# ---------------------------------------------------------------------------

async def _publish_mission_event(mission_id: str, event_type: str, data: dict) -> None:
    """Publish a mission event to Redis for WebSocket relay."""
    try:
        from openforge.db.redis_client import get_redis
        redis = await get_redis()
        payload = json.dumps({"type": event_type, "data": data}, default=str)
        await redis.publish(f"mission:{mission_id}", payload)
    except Exception as exc:
        logger.warning("Mission event publish failed for %s: %s", mission_id, exc)


async def _update_mission_snapshot(mission_id: str, snapshot: dict) -> None:
    """Store the current mission timeline state in Redis for snapshot recovery."""
    try:
        from openforge.db.redis_client import get_redis
        redis = await get_redis()
        await redis.set(
            f"mission_timeline:{mission_id}",
            json.dumps(snapshot, default=str),
            ex=3600,  # 1 hour TTL
        )
    except Exception as exc:
        logger.warning("Mission snapshot update failed for %s: %s", mission_id, exc)


def _sanitize_pg_json(value: Any) -> Any:
    """Strip null bytes that PostgreSQL JSONB columns reject."""
    if value is None:
        return None
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_sanitize_pg_json(item) for item in value]
    if isinstance(value, dict):
        return {k: _sanitize_pg_json(v) for k, v in value.items()}
    return value


# ---------------------------------------------------------------------------
# Structured output parsing
# ---------------------------------------------------------------------------

_MISSION_OUTPUT_RE = re.compile(
    r"```mission_output\s*\n(.*?)```",
    re.DOTALL,
)

OODA_KEYS = {"perceive", "plan", "act", "evaluate", "reflect"}


def _parse_mission_output(text: str) -> dict[str, Any] | None:
    """Extract the structured mission output JSON from agent response text.

    Looks for a fenced block wrapped in ```mission_output ... ```.
    Uses the LAST match to avoid accidentally grabbing quoted/referenced blocks.
    Falls back to trying to parse the entire response as JSON.
    """
    # Find ALL matches and use the last one (most likely the actual output)
    matches = list(_MISSION_OUTPUT_RE.finditer(text))
    for match in reversed(matches):
        try:
            parsed = json.loads(match.group(1).strip())
            if isinstance(parsed, dict):
                return _normalize_mission_json(parsed)
        except json.JSONDecodeError:
            logger.warning("Found mission_output block but JSON parse failed, trying previous match")
            continue

    # Fallback: try full-text JSON parse
    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, dict):
            return _normalize_mission_json(parsed)
    except (json.JSONDecodeError, ValueError):
        pass

    return None


def _normalize_mission_json(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize mission output JSON structure.

    If OODA phase keys exist at the top level instead of nested under
    'phase_summaries', wrap them into the expected structure.
    """
    if "phase_summaries" in parsed and isinstance(parsed["phase_summaries"], dict):
        # Already in expected format, validate it has at least one OODA key
        if parsed["phase_summaries"].keys() & OODA_KEYS:
            return parsed

    # Check if OODA keys are at the top level
    top_level_phases = {k: parsed[k] for k in OODA_KEYS if k in parsed}
    if top_level_phases:
        # Wrap them into phase_summaries
        if "phase_summaries" not in parsed:
            parsed["phase_summaries"] = {}
        parsed["phase_summaries"].update(top_level_phases)
        return parsed

    # Return as-is even without OODA keys (might have other useful data)
    return parsed


# ---------------------------------------------------------------------------
# Rubric ratchet evaluation
# ---------------------------------------------------------------------------

def _evaluate_ratchet(
    rubric: list[dict],
    current_scores: dict[str, float],
    previous_scores: dict[str, float] | None,
) -> bool:
    """Compare current evaluation scores against previous cycle scores.

    Returns True if the ratchet constraint is satisfied (no regression
    beyond tolerance), False otherwise.
    """
    if not previous_scores:
        return True

    for criterion in rubric:
        name = criterion.get("name", "")
        ratchet_type = criterion.get("ratchet", "relaxed")
        current = current_scores.get(name)
        previous = previous_scores.get(name)

        if current is None or previous is None:
            continue

        if ratchet_type == "strict":
            if current < previous:
                logger.info(
                    "Ratchet FAILED (strict): %s dropped from %.2f to %.2f",
                    name, previous, current,
                )
                return False
        elif ratchet_type == "relaxed":
            # Allow up to 10% decrease
            threshold = previous * 0.9
            if current < threshold:
                logger.info(
                    "Ratchet FAILED (relaxed): %s dropped from %.2f to %.2f (threshold %.2f)",
                    name, previous, current, threshold,
                )
                return False

    return True


# ---------------------------------------------------------------------------
# Auto-termination checks
# ---------------------------------------------------------------------------

async def _check_health(
    mission: MissionModel,
    cycle: MissionCycleModel,
    db: AsyncSession,
) -> str | None:
    """Check mission health signals for auto-pause conditions.

    Returns a reason string if the mission should be paused, None otherwise.
    """
    CONSECUTIVE_FAILURE_THRESHOLD = 3
    STUCK_CYCLE_THRESHOLD = 4

    # 1. Failure rate: if the last N cycles all failed, pause
    recent_cycles_stmt = (
        select(MissionCycleModel)
        .where(MissionCycleModel.mission_id == mission.id)
        .order_by(MissionCycleModel.cycle_number.desc())
        .limit(CONSECUTIVE_FAILURE_THRESHOLD)
    )
    result = await db.execute(recent_cycles_stmt)
    recent_cycles = result.scalars().all()

    if len(recent_cycles) >= CONSECUTIVE_FAILURE_THRESHOLD:
        if all(c.status == "failed" for c in recent_cycles):
            return (
                f"Auto-paused: last {CONSECUTIVE_FAILURE_THRESHOLD} cycles all failed. "
                f"Latest error: {recent_cycles[0].error_message or 'unknown'}"
            )

    # 2. Stuck detection: if evaluation scores are identical across N completed cycles
    completed_cycles_stmt = (
        select(MissionCycleModel)
        .where(
            MissionCycleModel.mission_id == mission.id,
            MissionCycleModel.status == "completed",
            MissionCycleModel.evaluation_scores.isnot(None),
        )
        .order_by(MissionCycleModel.cycle_number.desc())
        .limit(STUCK_CYCLE_THRESHOLD)
    )
    result = await db.execute(completed_cycles_stmt)
    scored_cycles = result.scalars().all()

    if len(scored_cycles) >= STUCK_CYCLE_THRESHOLD:
        scores = [json.dumps(c.evaluation_scores, sort_keys=True) for c in scored_cycles]
        if len(set(scores)) == 1:
            return (
                f"Auto-paused: evaluation scores unchanged across "
                f"last {STUCK_CYCLE_THRESHOLD} cycles — mission may be stuck"
            )

    # 3. Duration anomaly: if this cycle took 5x the rolling average
    if cycle.duration_seconds and len(scored_cycles) >= 3:
        durations = [c.duration_seconds for c in scored_cycles if c.duration_seconds]
        if durations:
            avg_duration = sum(durations) / len(durations)
            if avg_duration > 0 and cycle.duration_seconds > avg_duration * 5:
                logger.warning(
                    "Mission %s cycle %d took %.1fs (5x avg %.1fs) — possible anomaly",
                    mission.id, cycle.cycle_number, cycle.duration_seconds, avg_duration,
                )

    return None


def _check_auto_termination(mission: MissionModel) -> str | None:
    """Check if any auto-termination conditions are met.

    Returns a reason string if the mission should terminate, None otherwise.
    """
    budget = mission.budget or {}

    max_cost = budget.get("max_cost")
    if max_cost is not None and mission.cost_estimate >= max_cost:
        return f"Budget exhausted: cost {mission.cost_estimate:.4f} >= limit {max_cost}"

    max_tokens = budget.get("max_tokens")
    if max_tokens is not None and mission.tokens_used >= max_tokens:
        return f"Token budget exhausted: {mission.tokens_used} >= limit {max_tokens}"

    max_cycles = budget.get("max_cycles")
    if max_cycles is not None and mission.cycle_count >= max_cycles:
        return f"Cycle limit reached: {mission.cycle_count} >= limit {max_cycles}"

    # Check custom termination conditions
    for condition in (mission.termination_conditions or []):
        ctype = condition.get("type")
        if ctype == "max_cycles":
            limit = condition.get("value")
            if limit is not None and mission.cycle_count >= int(limit):
                return f"Termination condition: max_cycles {mission.cycle_count} >= {limit}"

    return None


# ---------------------------------------------------------------------------
# Sink routing
# ---------------------------------------------------------------------------

async def _route_phase_sinks(
    phase_summaries: dict[str, str],
    phase_sinks: dict[str, list[dict]],
    db: AsyncSession,
    fallback_workspace_id: UUID | None,
    run_id: UUID,
) -> None:
    """Route phase outputs through configured sinks."""
    from openforge.runtime.sink_handlers import execute_sink

    for phase_name, summary in phase_summaries.items():
        sinks = phase_sinks.get(phase_name, [])
        for sink_config in sinks:
            sink_type = sink_config.get("type")
            if not sink_type:
                continue
            try:
                sink_inputs = dict(sink_config.get("inputs", {}))
                # Inject the phase summary as default data/content
                if "data" not in sink_inputs:
                    sink_inputs["data"] = summary
                if "content" not in sink_inputs:
                    sink_inputs["content"] = summary
                if "title" not in sink_inputs:
                    sink_inputs["title"] = f"Mission cycle - {phase_name}"

                await execute_sink(sink_type, sink_inputs, db, fallback_workspace_id=fallback_workspace_id, run_id=run_id)
            except Exception as exc:
                logger.warning(
                    "Sink %s for phase %s failed: %s", sink_type, phase_name, exc,
                )


# ---------------------------------------------------------------------------
# Main cycle executor
# ---------------------------------------------------------------------------

async def execute_cycle(
    mission_id: UUID,
    cycle_id: UUID,
    run_id: UUID,
) -> None:
    """Execute a single mission cycle.

    1. Load mission + cycle + autonomous agent spec
    2. Build mission context and postamble
    3. Assemble full system prompt
    4. Call execute_agent()
    5. Parse structured output
    6. Update cycle and mission state
    7. Check termination conditions
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession as _AsyncSession
    from openforge.config import get_settings
    from openforge.core.llm_gateway import LLMGateway
    from openforge.integrations.tools.dispatcher import tool_dispatcher
    from openforge.runtime.agent_executor import execute_agent
    from openforge.runtime.agent_registry import agent_registry
    from openforge.runtime.event_publisher import EventPublisher

    started_at = time.monotonic()

    settings = get_settings()
    _engine = create_async_engine(settings.database_url, echo=False, pool_size=5, max_overflow=10)
    _Session = async_sessionmaker(_engine, class_=_AsyncSession, expire_on_commit=False)
    async with _Session() as db:
        try:
            # 1. Load mission, cycle, and run
            mission = await db.get(MissionModel, mission_id)
            if mission is None:
                raise RuntimeError(f"Mission {mission_id} not found")

            cycle = await db.get(MissionCycleModel, cycle_id)
            if cycle is None:
                raise RuntimeError(f"Cycle {cycle_id} not found")

            run = await db.get(RunModel, run_id)
            if run is None:
                raise RuntimeError(f"Run {run_id} not found")

            # Load autonomous agent
            agent = await db.get(AgentModel, mission.autonomous_agent_id)
            if agent is None:
                raise RuntimeError(
                    f"Autonomous agent {mission.autonomous_agent_id} not found"
                )

            # Build runtime config from agent's active version
            spec: AgentRuntimeConfig | None = None
            if agent.active_version_id:
                spec_model = await db.get(
                    AgentDefinitionVersionModel, agent.active_version_id
                )
                if spec_model and spec_model.snapshot:
                    snapshot = spec_model.snapshot or {}
                    spec = build_runtime_config_from_snapshot(
                        snapshot=snapshot,
                        agent_id=spec_model.agent_id,
                        agent_slug=snapshot.get("slug", agent.slug),
                        version=spec_model.version,
                        profile_id=UUID(int=0),
                    )

            if spec is None:
                raise RuntimeError(
                    f"Cannot resolve AgentRuntimeConfig for agent {agent.slug}"
                )

            # 2. Gather workspace data (user workspaces only)
            workspaces_data: list[dict] = []
            try:
                ws_stmt = (
                    select(
                        Workspace,
                        sa_func.count(Knowledge.id).label("knowledge_count"),
                    )
                    .outerjoin(Knowledge, Knowledge.workspace_id == Workspace.id)
                    .where(Workspace.ownership_type == "user")
                    .group_by(Workspace.id)
                    .order_by(Workspace.sort_order)
                )
                ws_results = (await db.execute(ws_stmt)).all()
                for ws, k_count in ws_results:
                    workspaces_data.append({
                        "id": str(ws.id),
                        "name": ws.name,
                        "description": ws.description or "",
                        "knowledge_count": k_count,
                    })
            except Exception:
                pass

            # Gather tools
            tools_data: list[dict] = []
            try:
                raw_tools = await tool_dispatcher.list_tools()
                for t in (raw_tools or []):
                    tools_data.append({
                        "id": t["id"],
                        "name": t.get("name", t["id"]),
                        "description": (t.get("description", "") or "")[:120],
                        "category": t.get("category", ""),
                    })
            except Exception:
                pass

            # Gather skills
            skills_data: list[dict] = []
            try:
                installed_skills = await tool_dispatcher.list_skills()
                for s in (installed_skills or []):
                    skills_data.append({
                        "id": s.get("id", ""),
                        "name": s.get("name", s.get("id", "")),
                        "description": (s.get("description", "") or "")[:120],
                    })
            except Exception:
                pass

            # Gather agents
            agents_data: list[dict] = []
            try:
                available = await agent_registry.list_available_agents(db)
                for a in available:
                    if a["id"] != agent.id:
                        agents_data.append({
                            "id": str(a["id"]),
                            "slug": a.get("slug", ""),
                            "name": a.get("name", ""),
                            "description": a.get("description", ""),
                            "tags": a.get("tags", []),
                        })
            except Exception:
                pass

            # 3. Build mission workspace info
            mission_workspace_info: dict[str, Any] | None = None
            if mission.owned_workspace_id:
                try:
                    mw_stmt = (
                        select(
                            Workspace,
                            sa_func.count(Knowledge.id).label("knowledge_count"),
                        )
                        .outerjoin(Knowledge, Knowledge.workspace_id == Workspace.id)
                        .where(Workspace.id == mission.owned_workspace_id)
                        .group_by(Workspace.id)
                    )
                    mw_result = (await db.execute(mw_stmt)).first()
                    if mw_result:
                        mw, mw_k_count = mw_result
                        mission_workspace_info = {
                            "id": str(mw.id),
                            "name": mw.name,
                            "knowledge_count": mw_k_count,
                        }
                except Exception:
                    pass

            # Get previous cycle evaluation scores for ratchet comparison
            previous_scores: dict[str, float] | None = None
            if cycle.cycle_number > 1:
                prev_stmt = (
                    select(MissionCycleModel)
                    .where(
                        MissionCycleModel.mission_id == mission_id,
                        MissionCycleModel.cycle_number == cycle.cycle_number - 1,
                        MissionCycleModel.status == "completed",
                    )
                )
                prev_result = (await db.execute(prev_stmt)).scalar_one_or_none()
                if prev_result and prev_result.evaluation_scores:
                    previous_scores = prev_result.evaluation_scores

            # 4. Build mission context
            budget = mission.budget or {}
            budget_remaining: dict[str, Any] | None = None
            if budget:
                budget_remaining = {}
                if budget.get("max_cost") is not None:
                    budget_remaining["cost"] = round(
                        budget["max_cost"] - mission.cost_estimate, 4
                    )
                if budget.get("max_tokens") is not None:
                    budget_remaining["tokens"] = (
                        budget["max_tokens"] - mission.tokens_used
                    )
                if budget.get("max_cycles") is not None:
                    budget_remaining["cycles"] = (
                        budget["max_cycles"] - mission.cycle_count
                    )

            mission_context = build_mission_context(
                mission_name=mission.name,
                goal=mission.goal,
                directives=mission.directives or [],
                constraints=mission.constraints or [],
                rubric=mission.rubric or [],
                cycle_number=cycle.cycle_number,
                current_plan=mission.current_plan,
                previous_evaluation=previous_scores,
                budget_remaining=budget_remaining,
            )

            # 5. Build postamble
            postamble = build_postamble(
                workspaces_data=workspaces_data,
                agents_data=agents_data,
                tools_data=tools_data,
                skills_data=skills_data,
                tools_enabled=spec.tools_enabled,
                mission_workspace=mission_workspace_info,
            )

            # 6. Build preamble with autonomous mode
            preamble = build_preamble(
                agent_name=spec.name or spec.agent_slug or mission.name,
                agent_description=f"Autonomous agent executing mission: {mission.name}",
                agent_mode="autonomous",
            )

            # 7. Assemble full system prompt
            base_prompt = spec.system_prompt or ""
            full_system_prompt = "\n\n".join(
                part for part in [preamble, base_prompt, mission_context, postamble] if part
            )

            # Override spec's system prompt with the assembled one
            spec = spec.model_copy(update={"system_prompt": full_system_prompt})

            # 8. Apply tool overrides from mission config
            if mission.tool_overrides:
                allowed = mission.tool_overrides.get("allowed_tools")
                if allowed is not None:
                    spec = spec.model_copy(update={"allowed_tools": allowed})
                if mission.tool_overrides.get("tools_enabled") is False:
                    spec = spec.model_copy(update={"tools_enabled": False})

            # 9. Call execute_agent
            input_payload = {
                "instruction": (
                    f"Execute mission cycle #{cycle.cycle_number} for mission "
                    f'"{mission.name}". Follow the OODA workflow '
                    "(perceive -> plan -> act -> evaluate -> reflect) and produce "
                    "the required structured output."
                ),
            }

            # Broadcast cycle_started event
            await _publish_mission_event(str(mission_id), "cycle_started", {
                "cycle_id": str(cycle.id),
                "cycle_number": cycle.cycle_number,
                "mission_id": str(mission_id),
                "started_at": cycle.started_at.isoformat() if cycle.started_at else None,
            })
            await _update_mission_snapshot(str(mission_id), {
                "mission_id": str(mission_id),
                "active_cycle": {
                    "cycle_id": str(cycle.id),
                    "cycle_number": cycle.cycle_number,
                    "status": "running",
                    "phase": cycle.phase,
                },
            })

            # Build tool callbacks to relay agent loop events as cycle_agent_event
            from openforge.runtime.tool_loop import ToolLoopCallbacks

            _mission_id_str = str(mission_id)
            _cycle_id_str = str(cycle.id)

            async def _pub_agent_event(event_type: str, event_data: dict):
                """Publish an agent loop event wrapped as cycle_agent_event."""
                await _publish_mission_event(_mission_id_str, "cycle_agent_event", {
                    "cycle_id": _cycle_id_str,
                    "event": {"type": event_type, **event_data},
                })

            async def _cb_thinking(chunk):
                await _pub_agent_event("agent_thinking", {"text": chunk})

            async def _cb_token(token):
                pass  # Don't stream tokens for mission cycles

            async def _cb_tool_start(call_id, tool_name, arguments):
                await _pub_agent_event("agent_tool_call_start", {
                    "call_id": call_id, "tool_name": tool_name, "arguments": arguments,
                })

            async def _cb_tool_result(call_id, tool_name, success, error=None, output=None, duration_ms=None, nested_timeline=None, delegated_conversation_id=None):
                await _pub_agent_event("agent_tool_call_result", {
                    "call_id": call_id, "tool_name": tool_name, "success": success,
                    "output": str(output)[:500] if output else None,
                    "error": str(error)[:500] if error else None,
                    "duration_ms": duration_ms,
                })

            _cycle_callbacks = ToolLoopCallbacks(
                on_thinking=_cb_thinking,
                on_token=_cb_token,
                on_tool_start=_cb_tool_start,
                on_tool_result=_cb_tool_result,
            )

            output = await execute_agent(
                spec,
                input_payload,
                db=db,
                run_id=run_id,
                event_publisher=EventPublisher(db),
                tool_dispatcher=tool_dispatcher,
                llm_gateway=LLMGateway(),
                tool_callbacks=_cycle_callbacks,
            )

            # 9. Parse structured output
            agent_response = output.get("output", "")
            parsed = _parse_mission_output(agent_response)

            phase_summaries: dict = {}
            actions_log: list = []
            evaluation_scores: dict = {}
            updated_plan: dict | None = None
            next_cycle_reason: str | None = None
            next_cycle_delay: int = 300  # default 5 minutes

            if parsed:
                phase_summaries = parsed.get("phase_summaries", {})
                actions_log = parsed.get("actions_taken", [])
                evaluation_scores = parsed.get("evaluation_scores", {})
                updated_plan = parsed.get("updated_plan")
                next_cycle_reason = parsed.get("next_cycle_reason")
                next_cycle_delay = parsed.get("next_cycle_delay_seconds", 300)
            else:
                logger.warning(
                    "Mission %s cycle %d: could not parse structured output",
                    mission_id, cycle.cycle_number,
                )
                phase_summaries = {"raw_output": agent_response[:2000]}

            # 10. Update cycle record
            elapsed = time.monotonic() - started_at
            cycle.phase = "completed"
            cycle.phase_summaries = _sanitize_pg_json(phase_summaries)
            cycle.actions_log = _sanitize_pg_json(actions_log)
            cycle.evaluation_scores = _sanitize_pg_json(evaluation_scores)
            cycle.duration_seconds = round(elapsed, 2)
            cycle.next_cycle_reason = (next_cycle_reason or "")[:500]

            # Compute next cycle timing
            if next_cycle_delay and next_cycle_delay > 0:
                cycle.next_cycle_requested_at = datetime.now(timezone.utc) + timedelta(
                    seconds=next_cycle_delay
                )

            # Token/cost tracking from run output
            run_tokens = (output.get("tool_calls") or [])
            cycle.tokens_used = len(run_tokens)  # approximate from tool call count
            cycle.cost_estimate = 0.0

            # 11. Evaluate rubric ratchet
            ratchet_passed = _evaluate_ratchet(
                mission.rubric or [],
                evaluation_scores,
                previous_scores,
            )
            cycle.ratchet_passed = ratchet_passed

            # 12. Route phase outputs through configured sinks
            if mission.phase_sinks:
                await _route_phase_sinks(
                    phase_summaries,
                    mission.phase_sinks,
                    db,
                    fallback_workspace_id=mission.owned_workspace_id,
                    run_id=run_id,
                )

            # 13. Update mission state
            mission.cycle_count = cycle.cycle_number
            mission.current_plan = _sanitize_pg_json(
                updated_plan or mission.current_plan
            )
            mission.tokens_used += cycle.tokens_used
            mission.cost_estimate += cycle.cost_estimate
            mission.last_cycle_at = datetime.now(timezone.utc)

            # Compute next_cycle_at from cadence or agent-requested delay
            cadence = mission.cadence or {}
            cadence_seconds = cadence.get("interval_seconds")
            if cadence_seconds:
                mission.next_cycle_at = datetime.now(timezone.utc) + timedelta(
                    seconds=cadence_seconds
                )
            elif next_cycle_delay and next_cycle_delay > 0:
                mission.next_cycle_at = datetime.now(timezone.utc) + timedelta(
                    seconds=next_cycle_delay
                )
            else:
                mission.next_cycle_at = datetime.now(timezone.utc) + timedelta(
                    seconds=300
                )

            # 14a. Check mission health (stuck detection, failure tracking)
            health_reason = await _check_health(mission, cycle, db)
            if health_reason:
                logger.warning(
                    "Mission %s health check failed: %s", mission_id, health_reason
                )
                mission.status = "paused"
                mission.next_cycle_at = None
                await _publish_mission_event(str(mission_id), "mission_health_pause", {
                    "mission_id": str(mission_id),
                    "reason": health_reason,
                    "cycle_number": cycle.cycle_number,
                })

            # 14b. Check auto-termination conditions
            termination_reason = _check_auto_termination(mission)
            if termination_reason:
                logger.info(
                    "Mission %s auto-terminating: %s", mission_id, termination_reason
                )
                mission.status = "completed"
                mission.completed_at = datetime.now(timezone.utc)
                mission.next_cycle_at = None

            # 15. Mark cycle complete
            cycle.status = "completed"
            cycle.completed_at = datetime.now(timezone.utc)

            await db.commit()
            logger.info(
                "Mission %s cycle %d completed in %.1fs (ratchet=%s)",
                mission_id, cycle.cycle_number, elapsed, ratchet_passed,
            )

            # Broadcast cycle_completed event
            await _publish_mission_event(str(mission_id), "cycle_completed", {
                "cycle_id": str(cycle.id),
                "cycle_number": cycle.cycle_number,
                "mission_id": str(mission_id),
                "status": "completed",
                "phase_summaries": phase_summaries,
                "evaluation_scores": evaluation_scores,
                "ratchet_passed": ratchet_passed,
                "actions_log": actions_log,
                "next_cycle_reason": next_cycle_reason,
                "duration_seconds": round(elapsed, 2),
            })
            await _update_mission_snapshot(str(mission_id), {
                "mission_id": str(mission_id),
                "active_cycle": {
                    "cycle_id": str(cycle.id),
                    "cycle_number": cycle.cycle_number,
                    "status": "completed",
                    "phase": "completed",
                    "phase_summaries": phase_summaries,
                    "evaluation_scores": evaluation_scores,
                    "ratchet_passed": ratchet_passed,
                    "actions_log": actions_log,
                    "next_cycle_reason": next_cycle_reason,
                    "duration_seconds": round(elapsed, 2),
                },
            })

        except Exception as exc:
            logger.exception(
                "Mission %s cycle %s failed: %s", mission_id, cycle_id, exc,
            )
            try:
                # Mark cycle as failed
                cycle = await db.get(MissionCycleModel, cycle_id)
                if cycle and cycle.status != "completed":
                    cycle.status = "failed"
                    cycle.error_message = str(exc)[:2000]
                    cycle.completed_at = datetime.now(timezone.utc)
                    cycle.duration_seconds = round(
                        time.monotonic() - started_at, 2
                    )
                    await db.commit()

                    # Broadcast cycle_failed event
                    await _publish_mission_event(str(mission_id), "cycle_failed", {
                        "cycle_id": str(cycle.id),
                        "cycle_number": cycle.cycle_number,
                        "mission_id": str(mission_id),
                        "error": str(exc),
                    })
                    await _update_mission_snapshot(str(mission_id), {
                        "mission_id": str(mission_id),
                        "active_cycle": {
                            "cycle_id": str(cycle.id),
                            "cycle_number": cycle.cycle_number,
                            "status": "failed",
                            "phase": "failed",
                        },
                    })
            except Exception:
                logger.warning(
                    "Failed to mark cycle %s as failed", cycle_id,
                )
            raise
    await _engine.dispose()
