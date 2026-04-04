"""Multi-node graph executor for automation DAGs.

Executes nodes in topological order, with parallel execution at each level.
Each node creates a child run to avoid step_index collisions with other nodes.
"""

from __future__ import annotations

import json
import logging
import re
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import AgentDefinitionVersionModel, RunModel, RunStepModel
from openforge.domains.agents.compiled_spec import AgentRuntimeConfig, build_runtime_config_from_snapshot
from openforge.domains.automations.compiled_spec import CompiledAutomationSpec, CompiledNodeSpec, CompiledSinkNodeSpec
from openforge.runtime.events import RuntimeEvent, NODE_STARTED, NODE_COMPLETED, NODE_FAILED
from openforge.runtime.sink_handlers import execute_sink
from openforge.runtime.template_engine import render

logger = logging.getLogger("openforge.runtime.graph_executor")


def _sanitize_pg_json(value):
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

# Pattern to extract the ```output ... ``` fenced block that the automation
# preamble instructs agents to produce.
_FENCED_OUTPUT_RE = re.compile(
    r"```output\s*\n(.*?)\n\s*```",
    re.DOTALL,
)


def _extract_structured_output(text: str) -> dict[str, Any] | None:
    """Try to extract structured JSON from agent output text.

    Agents in automation context are instructed to wrap output in a
    ```output ... ``` fenced block.  We try (in order):
    1. Extract from ```output fenced block
    2. Parse the entire text as JSON
    """
    # 1. Fenced output block
    m = _FENCED_OUTPUT_RE.search(text)
    if m:
        try:
            parsed = json.loads(m.group(1))
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass

    # 2. Whole text as JSON
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass

    return None


class GraphExecutor:
    """Execute a multi-node automation DAG."""

    def __init__(
        self,
        db: AsyncSession,
        event_publisher=None,
        tool_dispatcher=None,
        llm_gateway=None,
    ):
        self.db = db
        self.event_publisher = event_publisher
        self.tool_dispatcher = tool_dispatcher
        self.llm_gateway = llm_gateway

    async def execute(
        self,
        run: RunModel,
        automation_spec: CompiledAutomationSpec,
        deployment_inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute all nodes in topological order.

        Returns the output of the last node at the final execution level.
        """
        output_store: dict[str, dict[str, Any]] = {}  # node_key -> {output_key: value}
        agent_lookup = {ns.node_key: ns for ns in automation_spec.nodes}
        sink_lookup = {sns.node_key: sns for sns in automation_spec.sink_nodes}

        # Transition parent run to running
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        for level_idx, level in enumerate(automation_spec.execution_levels):
            for node_key in level:
                node_type = "agent" if node_key in agent_lookup else "sink" if node_key in sink_lookup else "unknown"

                # Publish node_started on parent run channel
                if self.event_publisher:
                    try:
                        await self.event_publisher.publish(RuntimeEvent(
                            run_id=run.id,
                            event_type=NODE_STARTED,
                            node_key=node_key,
                            payload={"node_key": node_key, "node_type": node_type},
                        ))
                    except Exception:
                        pass

                try:
                    if node_key in agent_lookup:
                        result = await self._execute_node(
                            parent_run=run,
                            node_spec=agent_lookup[node_key],
                            output_store=output_store,
                            deployment_inputs=deployment_inputs,
                        )
                    elif node_key in sink_lookup:
                        result = await self._execute_sink_node(
                            parent_run=run,
                            sink_spec=sink_lookup[node_key],
                            output_store=output_store,
                            deployment_inputs=deployment_inputs,
                        )
                    else:
                        logger.warning("Node %s not found in agent or sink specs, skipping", node_key)
                        continue
                    output_store[node_key] = result

                    # Publish node_completed
                    if self.event_publisher:
                        try:
                            output_preview = str(result)[:500] if result else ""
                            await self.event_publisher.publish(RuntimeEvent(
                                run_id=run.id,
                                event_type=NODE_COMPLETED,
                                node_key=node_key,
                                payload={"node_key": node_key, "node_type": node_type, "output_preview": output_preview},
                            ))
                        except Exception:
                            pass

                except Exception as exc:
                    # Publish node_failed
                    if self.event_publisher:
                        try:
                            await self.event_publisher.publish(RuntimeEvent(
                                run_id=run.id,
                                event_type=NODE_FAILED,
                                node_key=node_key,
                                payload={"node_key": node_key, "node_type": node_type, "error": str(exc)[:500]},
                            ))
                        except Exception:
                            pass
                    raise

        # Return the last level's last node output
        if automation_spec.execution_levels:
            last_level = automation_spec.execution_levels[-1]
            if last_level:
                return output_store.get(last_level[-1], {})

        return {}

    def _resolve_inputs(
        self,
        node_key: str,
        wired_inputs: dict[str, Any],
        static_inputs: dict[str, Any],
        output_store: dict[str, dict[str, Any]],
        deployment_inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Resolve all inputs for a node (shared by agent and sink execution)."""
        resolved: dict[str, Any] = {}

        # Static inputs first
        for key, value in static_inputs.items():
            resolved[key] = value

        # Wired inputs (from upstream node outputs)
        for input_key, wire_info in wired_inputs.items():
            if isinstance(wire_info, list):
                parts = []
                for src in wire_info:
                    src_key = src.get("source_node_key", "")
                    src_output = src.get("source_output_key", "output")
                    if src_key in output_store:
                        val = output_store[src_key].get(src_output, "")
                        if val:
                            parts.append(str(val))
                resolved[input_key] = "\n\n---\n\n".join(parts) if parts else ""
            else:
                src_key = wire_info.get("source_node_key", "")
                src_output = wire_info.get("source_output_key", "output")
                if src_key in output_store:
                    resolved[input_key] = output_store[src_key].get(src_output, "")

        # Deployment inputs
        node_prefix = f"{node_key}."
        for full_key, value in deployment_inputs.items():
            if full_key.startswith(node_prefix):
                input_key = full_key[len(node_prefix):]
                if input_key not in resolved:
                    resolved[input_key] = value
            elif "." not in full_key and full_key not in resolved:
                resolved.setdefault(full_key, value)

        return resolved

    async def _execute_node(
        self,
        parent_run: RunModel,
        node_spec: CompiledNodeSpec,
        output_store: dict[str, dict[str, Any]],
        deployment_inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a single node in the DAG.

        1. Resolve all inputs (wired from output_store, static, or deployment)
        2. Render agent system_prompt_template with resolved inputs
        3. Create a child RunModel for this node
        4. Execute via agent_executor (which manages its own steps)
        5. Parse output
        6. Return outputs dict
        """
        # 1. Resolve inputs
        resolved_inputs = self._resolve_inputs(
            node_spec.node_key,
            node_spec.wired_inputs,
            node_spec.static_inputs,
            output_store,
            deployment_inputs,
        )

        # 2. Load agent spec and render template
        agent_spec_row = await self.db.get(AgentDefinitionVersionModel, node_spec.agent_spec_id)
        if not agent_spec_row:
            raise ValueError(f"Agent spec {node_spec.agent_spec_id} not found for node {node_spec.node_key}")

        snapshot = agent_spec_row.snapshot or {}
        template = snapshot.get("system_prompt", "")
        is_parameterized = bool(snapshot.get("parameters"))

        rendered_prompt = template
        if is_parameterized and template and resolved_inputs:
            render_result = render(template, resolved_inputs)
            rendered_prompt = render_result.output

        # Build automation preamble/postamble so the LLM knows the expected output format
        from openforge.runtime.prompt_context import build_preamble, build_postamble

        snapshot_input_schema = snapshot.get("parameters", [])
        snapshot_output_defs = snapshot.get("output_definitions", [])

        automation_preamble = build_preamble(
            agent_name=snapshot.get("name", "Agent"),
            agent_description=snapshot.get("description", ""),
            agent_mode=snapshot.get("mode", "pipeline"),
            input_schema=snapshot_input_schema,
            output_definitions=snapshot_output_defs,
        )

        # Gather context data for postamble
        workspaces_data: list[dict] = []
        tools_data: list[dict] = []
        try:
            from openforge.db.models import Workspace as _Workspace, Knowledge as _Knowledge
            from sqlalchemy import func as _func, select as _select

            ws_stmt = (
                _select(_Workspace, _func.count(_Knowledge.id).label("kc"))
                .outerjoin(_Knowledge, _Knowledge.workspace_id == _Workspace.id)
                .group_by(_Workspace.id)
                .order_by(_Workspace.sort_order)
            )
            for ws, kc in (await self.db.execute(ws_stmt)).all():
                workspaces_data.append({
                    "id": str(ws.id), "name": ws.name,
                    "description": ws.description or "", "knowledge_count": kc,
                })
        except Exception:
            pass

        try:
            raw_tools = await self.tool_dispatcher.list_tools()
            for t in (raw_tools or []):
                tools_data.append({
                    "id": t["id"],
                    "name": t.get("name", t["id"]),
                    "description": (t.get("description", "") or "")[:120],
                })
        except Exception:
            pass

        automation_postamble = build_postamble(
            workspace_id=parent_run.workspace_id,
            workspaces_data=workspaces_data,
            agents_data=[],
            tools_data=tools_data,
            skills_data=[],
            tools_enabled=snapshot.get("tools_enabled", True),
        )

        # Assemble: preamble + rendered user prompt + postamble
        prompt_parts = [automation_preamble, rendered_prompt]
        if automation_postamble:
            prompt_parts.append(automation_postamble)
        rendered_prompt = "\n\n---\n\n".join(prompt_parts)

        # 3. Create a child run for this node so agent_executor can manage
        #    its own steps without step_index collisions.
        child_run = RunModel(
            id=_uuid.uuid4(),
            run_type="automation",
            parent_run_id=parent_run.id,
            root_run_id=parent_run.root_run_id or parent_run.id,
            workspace_id=parent_run.workspace_id,
            status="pending",
            input_payload={
                "input_values": resolved_inputs,
                "rendered_system_prompt": rendered_prompt,
                "instruction": rendered_prompt,
            },
            composite_metadata={
                "agent_id": str(node_spec.agent_id),
                "agent_spec_id": str(node_spec.agent_spec_id),
                "node_key": node_spec.node_key,
                "parent_run_id": str(parent_run.id),
            },
        )
        self.db.add(child_run)
        await self.db.flush()

        # Publish child run ID so frontend can connect for sub-step streaming
        if self.event_publisher:
            try:
                await self.event_publisher.publish(RuntimeEvent(
                    run_id=parent_run.id,
                    event_type="node_child_run",
                    node_key=node_spec.node_key,
                    payload={"node_key": node_spec.node_key, "child_run_id": str(child_run.id)},
                ))
            except Exception:
                pass

        # 4. Execute via agent_executor
        try:
            from openforge.runtime.agent_executor import execute_agent

            spec = build_runtime_config_from_snapshot(
                snapshot=snapshot,
                agent_id=agent_spec_row.agent_id,
                agent_slug=snapshot.get("slug", ""),
                version=agent_spec_row.version,
                profile_id=_uuid.uuid4(),
            )
            spec.system_prompt = rendered_prompt

            result = await execute_agent(
                spec,
                {
                    "input_values": resolved_inputs,
                    "rendered_system_prompt": rendered_prompt,
                    "instruction": rendered_prompt,
                },
                db=self.db,
                workspace_id=parent_run.workspace_id,
                run_id=child_run.id,
                event_publisher=self.event_publisher,
                tool_dispatcher=self.tool_dispatcher,
                llm_gateway=self.llm_gateway,
            )

            # 5. Parse output
            output_text = ""
            if isinstance(result, dict):
                output_text = result.get("output", result.get("response", str(result)))
            elif isinstance(result, str):
                output_text = result
            else:
                output_text = str(result)

            # Try to parse structured outputs from the response.
            # Agents in automation context are instructed to wrap output in
            # a ```output ... ``` fenced block containing JSON.
            outputs: dict[str, Any] = {"output": output_text}
            output_defs = node_spec.output_definitions
            expected_keys = {od.get("key") for od in output_defs if od.get("key")}

            if expected_keys:
                parsed = _extract_structured_output(output_text)
                if parsed and isinstance(parsed, dict):
                    for k, v in parsed.items():
                        outputs[k] = v
                    outputs.setdefault("output", output_text)

            return outputs

        except Exception as exc:
            # Update child run to failed if not already done by agent_executor
            try:
                child_run_fresh = await self.db.get(RunModel, child_run.id)
                if child_run_fresh and child_run_fresh.status not in ("failed", "completed"):
                    child_run_fresh.status = "failed"
                    child_run_fresh.error_message = str(exc)[:2000]
                    child_run_fresh.completed_at = datetime.now(timezone.utc)
                    await self.db.flush()
            except Exception:
                pass
            raise

    async def _execute_sink_node(
        self,
        parent_run: RunModel,
        sink_spec: CompiledSinkNodeSpec,
        output_store: dict[str, dict[str, Any]],
        deployment_inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a single sink node in the DAG.

        1. Resolve inputs (wired, static, deployment)
        2. Create child RunModel with run_type='sink'
        3. Invoke sink handler
        4. Update child run with result
        5. Return output dict
        """
        import uuid as _uuid

        # 1. Resolve inputs
        resolved_inputs = self._resolve_inputs(
            sink_spec.node_key,
            sink_spec.wired_inputs,
            sink_spec.static_inputs,
            output_store,
            deployment_inputs,
        )

        # 2. Create child run
        child_run = RunModel(
            id=_uuid.uuid4(),
            run_type="sink",
            parent_run_id=parent_run.id,
            root_run_id=parent_run.root_run_id or parent_run.id,
            workspace_id=parent_run.workspace_id,
            status="pending",
            input_payload={"input_values": resolved_inputs},
            composite_metadata={
                "sink_type": sink_spec.sink_type,
                "sink_id": str(sink_spec.sink_id) if sink_spec.sink_id else None,
                "node_key": sink_spec.node_key,
                "parent_run_id": str(parent_run.id),
            },
        )
        self.db.add(child_run)
        await self.db.flush()

        # Publish child run ID so frontend can connect for sub-step streaming
        if self.event_publisher:
            try:
                await self.event_publisher.publish(RuntimeEvent(
                    run_id=parent_run.id,
                    event_type="node_child_run",
                    node_key=sink_spec.node_key,
                    payload={"node_key": sink_spec.node_key, "child_run_id": str(child_run.id)},
                ))
            except Exception:
                pass

        # 3. Execute sink handler
        try:
            child_run.status = "running"
            child_run.started_at = datetime.now(timezone.utc)
            await self.db.flush()

            result = await execute_sink(
                sink_type=sink_spec.sink_type,
                inputs=resolved_inputs,
                db=self.db,
                workspace_id=parent_run.workspace_id,
                run_id=child_run.id,
            )

            # 4. Update child run
            child_run.status = "completed"
            child_run.output_payload = _sanitize_pg_json(result)
            child_run.completed_at = datetime.now(timezone.utc)
            await self.db.flush()

            return result

        except Exception as exc:
            try:
                child_run_fresh = await self.db.get(RunModel, child_run.id)
                if child_run_fresh and child_run_fresh.status not in ("failed", "completed"):
                    child_run_fresh.status = "failed"
                    child_run_fresh.error_message = str(exc)[:2000]
                    child_run_fresh.completed_at = datetime.now(timezone.utc)
                    await self.db.flush()
            except Exception:
                pass
            raise
