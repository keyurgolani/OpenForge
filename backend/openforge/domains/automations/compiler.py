"""Automation blueprint compiler.

Resolves an AutomationBlueprint into a CompiledAutomationSpec and persists it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentModel,
    AutomationModel,
    AgentDefinitionVersionModel,
    CompiledAutomationSpecModel,
    SinkModel,
    TriggerDefinitionModel,
)

from openforge.runtime.sink_handlers import SINK_TYPE_INPUTS

from .blueprint import AutomationBlueprint
from .compiled_spec import CompiledAutomationSpec, CompiledNodeSpec, CompiledSinkNodeSpec
from .graph_validation import compute_execution_order, resolve_unfilled_inputs, validate_dag

logger = logging.getLogger("openforge.automations.compiler")

COMPILER_VERSION = "1.0.0"


class AutomationBlueprintCompiler:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def compile(
        self,
        automation: AutomationModel,
        blueprint: AutomationBlueprint,
    ) -> CompiledAutomationSpec:
        """Compile an automation blueprint into an immutable spec."""
        try:
            if len(blueprint.nodes) == 0:
                raise ValueError("Automation requires at least one node")

            spec = await self._compile_multi_node(automation, blueprint)

            # Determine next version
            next_version = await self._next_version(automation.id)

            # Persist spec
            spec_row = CompiledAutomationSpecModel(
                automation_id=automation.id,
                version=next_version,
                resolved_config=spec.model_dump(mode="json"),
                agent_spec_id=spec.agent_spec_id,
                trigger_id=spec.trigger_id,
                graph_snapshot={
                    "nodes": [n.model_dump() for n in blueprint.nodes] if blueprint.nodes else [],
                    "edges": [e.model_dump() for e in blueprint.edges] if blueprint.edges else [],
                    "static_inputs": [s.model_dump() for s in blueprint.static_inputs] if blueprint.static_inputs else [],
                },
                node_specs=self._build_node_specs_dict(spec),
                compiler_version=COMPILER_VERSION,
                is_valid=True,
                validation_errors=[],
            )
            self.db.add(spec_row)
            await self.db.flush()

            # Update automation
            automation.active_spec_id = spec_row.id
            automation.compilation_status = "success"
            automation.compilation_error = None
            automation.last_compiled_at = datetime.now(timezone.utc)

            await self.db.commit()
            await self.db.refresh(spec_row)

            logger.info("Compiled automation %s v%d", automation.slug, next_version)
            return spec

        except Exception as e:
            await self.db.rollback()
            automation.compilation_status = "failed"
            automation.compilation_error = str(e)
            self.db.add(automation)
            await self.db.commit()
            logger.error("Failed to compile automation %s: %s", automation.slug, e)
            raise

    @staticmethod
    def _build_node_specs_dict(spec: CompiledAutomationSpec) -> dict:
        result = {}
        for ns in (spec.nodes or []):
            result[ns.node_key] = ns.model_dump(mode="json")
        for sns in (spec.sink_nodes or []):
            result[sns.node_key] = sns.model_dump(mode="json")
        return result

    async def _compile_multi_node(
        self,
        automation: AutomationModel,
        blueprint: AutomationBlueprint,
    ) -> CompiledAutomationSpec:
        """Compile a multi-node graph automation."""
        # Resolve each node's agent and active compiled spec
        node_dicts = [n.model_dump() for n in blueprint.nodes]
        edge_dicts = [e.model_dump() for e in blueprint.edges]
        static_input_dicts = [s.model_dump() for s in blueprint.static_inputs]

        # Build constant value lookup for compile-time resolution
        constant_values: dict[str, object] = {}
        for node_bp in blueprint.nodes:
            if node_bp.node_type == "constant":
                constant_values[node_bp.node_key] = (node_bp.config or {}).get("value", "")

        # Filter constant nodes from DAG processing
        node_dicts = [n for n in node_dicts if n.get("node_type", "agent") != "constant"]
        edge_dicts = [e for e in edge_dicts if e["source_node_key"] not in constant_values]

        # Validate DAG
        validate_dag(node_dicts, edge_dicts)
        execution_levels = compute_execution_order(node_dicts, edge_dicts)

        # Build node specs
        agent_specs: dict[str, dict] = {}
        compiled_nodes: list[CompiledNodeSpec] = []

        for node_bp in blueprint.nodes:
            if node_bp.node_type in ("sink", "constant"):
                continue

            agent = await self.db.scalar(
                select(AgentModel).where(AgentModel.slug == node_bp.agent_slug)
            )
            if not agent:
                raise ValueError(f"Agent '{node_bp.agent_slug}' not found for node '{node_bp.node_key}'")
            if not agent.active_version_id:
                raise ValueError(f"Agent '{node_bp.agent_slug}' has no compiled spec")

            agent_spec = await self.db.get(AgentDefinitionVersionModel, agent.active_version_id)
            if not agent_spec:
                raise ValueError(f"Agent spec not found for '{node_bp.agent_slug}'")

            resolved = agent_spec.snapshot or {}
            input_schema = resolved.get("parameters") or resolved.get("input_schema", [])
            output_defs = resolved.get("output_definitions", [{"key": "output", "type": "text"}])

            agent_specs[node_bp.node_key] = {
                "input_schema": input_schema,
                "output_definitions": output_defs,
            }

            # Build static inputs for this node (before wired_inputs so constants can resolve into it)
            static_vals: dict[str, object] = {}
            for si in blueprint.static_inputs:
                if si.node_key == node_bp.node_key:
                    static_vals[si.input_key] = si.value

            # Build wired inputs, resolving constants into static_vals
            wired_inputs: dict[str, list | dict] = {}
            for edge in blueprint.edges:
                if edge.target_node_key == node_bp.node_key:
                    # If source is a constant node, resolve to static input
                    if edge.source_node_key in constant_values:
                        static_vals[edge.target_input_key] = constant_values[edge.source_node_key]
                        continue
                    source_info = {
                        "source_node_key": edge.source_node_key,
                        "source_output_key": edge.source_output_key,
                    }
                    if edge.target_input_key in wired_inputs:
                        existing = wired_inputs[edge.target_input_key]
                        if isinstance(existing, dict):
                            wired_inputs[edge.target_input_key] = [existing, source_info]
                        else:
                            existing.append(source_info)
                    else:
                        wired_inputs[edge.target_input_key] = source_info

            # Determine unfilled inputs
            unfilled = []
            for param in input_schema:
                pname = param.get("name", "")
                if pname in wired_inputs or pname in static_vals:
                    continue
                unfilled.append(param)

            compiled_nodes.append(CompiledNodeSpec(
                node_key=node_bp.node_key,
                agent_id=agent.id,
                agent_spec_id=agent_spec.id,
                input_schema=input_schema,
                output_definitions=output_defs,
                wired_inputs=wired_inputs,
                static_inputs=static_vals,
                unfilled_inputs=unfilled,
            ))

        # Build compiled sink nodes
        compiled_sink_nodes: list[CompiledSinkNodeSpec] = []

        for node_bp in blueprint.nodes:
            if node_bp.node_type != "sink" or not node_bp.sink_type:
                continue

            sink_config: dict = {}
            if node_bp.sink_id:
                sink_model = await self.db.get(SinkModel, node_bp.sink_id)
                if sink_model:
                    sink_config = sink_model.config or {}

            input_schema = SINK_TYPE_INPUTS.get(node_bp.sink_type, [])

            # Build static inputs for this sink node (before wired_inputs so constants can resolve into it)
            static_vals: dict[str, object] = {}
            for si in blueprint.static_inputs:
                if si.node_key == node_bp.node_key:
                    static_vals[si.input_key] = si.value

            # Build wired inputs, resolving constants into static_vals
            wired_inputs: dict[str, list | dict] = {}
            for edge in blueprint.edges:
                if edge.target_node_key == node_bp.node_key:
                    # If source is a constant node, resolve to static input
                    if edge.source_node_key in constant_values:
                        static_vals[edge.target_input_key] = constant_values[edge.source_node_key]
                        continue
                    source_info = {
                        "source_node_key": edge.source_node_key,
                        "source_output_key": edge.source_output_key,
                    }
                    if edge.target_input_key in wired_inputs:
                        existing = wired_inputs[edge.target_input_key]
                        if isinstance(existing, dict):
                            wired_inputs[edge.target_input_key] = [existing, source_info]
                        else:
                            existing.append(source_info)
                    else:
                        wired_inputs[edge.target_input_key] = source_info

            # Merge hardcoded defaults from sink config (input_defaults.X keys)
            for cfg_key, cfg_val in sink_config.items():
                if cfg_key.startswith("input_defaults.") and cfg_val:
                    input_key = cfg_key[len("input_defaults."):]
                    if input_key not in wired_inputs and input_key not in static_vals:
                        static_vals[input_key] = cfg_val

            compiled_sink_nodes.append(CompiledSinkNodeSpec(
                node_key=node_bp.node_key,
                sink_type=node_bp.sink_type,
                sink_id=node_bp.sink_id,
                config=sink_config,
                input_schema=input_schema,
                wired_inputs=wired_inputs,
                static_inputs=static_vals,
            ))

        # Resolve deployment input schema (unfilled inputs across all nodes)
        sink_specs_dict: dict[str, dict] = {}
        for sns in compiled_sink_nodes:
            sink_specs_dict[sns.node_key] = {"input_schema": sns.input_schema}

        deployment_input_schema = resolve_unfilled_inputs(
            node_dicts, edge_dicts, static_input_dicts, agent_specs, sink_specs_dict
        )

        trigger = await self._upsert_trigger(automation, blueprint)

        return CompiledAutomationSpec(
            automation_id=automation.id,
            automation_slug=automation.slug,
            name=blueprint.name,
            trigger_type=blueprint.trigger.type,
            schedule_expression=blueprint.trigger.schedule,
            interval_seconds=blueprint.trigger.interval_seconds,
            event_type=blueprint.trigger.event_type,
            is_multi_node=True,
            nodes=compiled_nodes,
            sink_nodes=compiled_sink_nodes,
            edges=edge_dicts,
            execution_levels=execution_levels,
            deployment_input_schema=deployment_input_schema,
            trigger_id=trigger.id if trigger else None,
            compiler_version=COMPILER_VERSION,
        )

    async def _upsert_trigger(
        self, automation: AutomationModel, blueprint: AutomationBlueprint
    ) -> TriggerDefinitionModel | None:
        """Create or update trigger definition for this automation."""
        if blueprint.trigger.type == "manual":
            return None

        trigger_name = f"{automation.slug}__trigger"
        trigger = await self.db.scalar(
            select(TriggerDefinitionModel).where(
                TriggerDefinitionModel.name == trigger_name,
                TriggerDefinitionModel.target_id == automation.id,
            )
        )

        if trigger is None:
            trigger = TriggerDefinitionModel(
                workspace_id=None,
                name=trigger_name,
                trigger_type=blueprint.trigger.type,
                target_type="automation",
                target_id=automation.id,
                schedule_expression=blueprint.trigger.schedule,
                interval_seconds=blueprint.trigger.interval_seconds,
                event_type=blueprint.trigger.event_type,
                payload_template=blueprint.trigger.payload_template,
                is_enabled=True,
                status="active",
            )
            self.db.add(trigger)
            await self.db.flush()
        else:
            trigger.trigger_type = blueprint.trigger.type
            trigger.schedule_expression = blueprint.trigger.schedule
            trigger.interval_seconds = blueprint.trigger.interval_seconds
            trigger.event_type = blueprint.trigger.event_type
            trigger.payload_template = blueprint.trigger.payload_template

        return trigger

    async def _next_version(self, automation_id) -> int:
        """Get the next version number for an automation's specs."""
        max_version = await self.db.scalar(
            select(func.max(CompiledAutomationSpecModel.version))
            .where(CompiledAutomationSpecModel.automation_id == automation_id)
        )
        return (max_version or 0) + 1
