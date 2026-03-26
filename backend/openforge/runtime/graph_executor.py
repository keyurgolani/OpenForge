"""Multi-node graph executor for automation DAGs.

Executes nodes in topological order, with parallel execution at each level.
Each node creates a child run to avoid step_index collisions with other nodes.
"""

from __future__ import annotations

import json
import logging
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import CompiledAgentSpecModel, RunModel, RunStepModel
from openforge.domains.agents.compiled_spec import AgentRuntimeConfig, build_runtime_config_from_snapshot
from openforge.domains.automations.compiled_spec import CompiledAutomationSpec, CompiledNodeSpec
from openforge.runtime.template_engine import render

logger = logging.getLogger("openforge.runtime.graph_executor")


class GraphExecutor:
    """Execute a multi-node automation DAG."""

    def __init__(
        self,
        db: AsyncSession,
        event_publisher=None,
        checkpoint_store=None,
        tool_dispatcher=None,
        llm_gateway=None,
    ):
        self.db = db
        self.event_publisher = event_publisher
        self.checkpoint_store = checkpoint_store
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
        node_lookup = {ns.node_key: ns for ns in automation_spec.nodes}

        # Transition parent run to running
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        for level_idx, level in enumerate(automation_spec.execution_levels):
            # Execute nodes at each level sequentially (shared DB session
            # is not safe for concurrent coroutines).
            for node_key in level:
                node_spec = node_lookup.get(node_key)
                if not node_spec:
                    logger.warning("Node %s not found in spec, skipping", node_key)
                    continue
                result = await self._execute_node(
                    parent_run=run,
                    node_spec=node_spec,
                    output_store=output_store,
                    deployment_inputs=deployment_inputs,
                )
                output_store[node_key] = result

        # Return the last level's last node output
        if automation_spec.execution_levels:
            last_level = automation_spec.execution_levels[-1]
            if last_level:
                return output_store.get(last_level[-1], {})

        return {}

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
        4. Execute via StrategyExecutor (which manages its own steps)
        5. Parse output
        6. Return outputs dict
        """
        # 1. Resolve inputs
        resolved_inputs: dict[str, Any] = {}

        # Static inputs first
        for key, value in node_spec.static_inputs.items():
            resolved_inputs[key] = value

        # Wired inputs (from upstream node outputs)
        for input_key, wire_info in node_spec.wired_inputs.items():
            src_key = wire_info.get("source_node_key", "")
            src_output = wire_info.get("source_output_key", "output")
            if src_key in output_store:
                resolved_inputs[input_key] = output_store[src_key].get(src_output, "")

        # Deployment inputs for this node.
        node_prefix = f"{node_spec.node_key}."
        for full_key, value in deployment_inputs.items():
            if full_key.startswith(node_prefix):
                input_key = full_key[len(node_prefix):]
                if input_key not in resolved_inputs:
                    resolved_inputs[input_key] = value
            elif "." not in full_key and full_key not in resolved_inputs:
                resolved_inputs.setdefault(full_key, value)

        # 2. Load agent spec and render template
        agent_spec_row = await self.db.get(CompiledAgentSpecModel, node_spec.agent_spec_id)
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
        from openforge.runtime.prompt_context import ExecutionContext, build_preamble, build_postamble

        snapshot_input_schema = snapshot.get("parameters", [])
        snapshot_output_defs = snapshot.get("output_definitions", [])

        automation_preamble = build_preamble(
            agent_name=snapshot.get("name", "Agent"),
            agent_description=snapshot.get("description", ""),
            context=ExecutionContext.AUTOMATION,
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

        # 3. Create a child run for this node so StrategyExecutor can manage
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

        # 4. Execute via StrategyExecutor
        try:
            from openforge.runtime.strategy_executor import StrategyExecutor

            spec = build_runtime_config_from_snapshot(
                snapshot=snapshot,
                agent_id=agent_spec_row.agent_id,
                agent_slug=snapshot.get("slug", ""),
                version=agent_spec_row.version,
                profile_id=_uuid.uuid4(),
            )
            spec.system_prompt = rendered_prompt

            executor = StrategyExecutor(
                self.db,
                event_publisher=self.event_publisher,
                checkpoint_store=self.checkpoint_store,
                tool_dispatcher=self.tool_dispatcher,
                llm_gateway=self.llm_gateway,
            )
            result = await executor.execute(
                spec,
                {
                    "input_values": resolved_inputs,
                    "rendered_system_prompt": rendered_prompt,
                    "instruction": rendered_prompt,
                },
                workspace_id=parent_run.workspace_id,
                run_id=child_run.id,
            )

            # 5. Parse output
            output_text = ""
            if isinstance(result, dict):
                output_text = result.get("output", result.get("response", str(result)))
            elif isinstance(result, str):
                output_text = result
            else:
                output_text = str(result)

            # Try to parse as JSON for structured outputs
            outputs: dict[str, Any] = {"output": output_text}
            output_defs = node_spec.output_definitions
            if any(od.get("type") == "json" and od.get("schema") for od in output_defs):
                try:
                    parsed = json.loads(output_text)
                    if isinstance(parsed, dict):
                        outputs = parsed
                        outputs.setdefault("output", output_text)
                except (json.JSONDecodeError, TypeError):
                    pass

            return outputs

        except Exception as exc:
            # Update child run to failed if not already done by StrategyExecutor
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
