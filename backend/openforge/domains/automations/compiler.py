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
    CompiledAgentSpecModel,
    CompiledAutomationSpecModel,
    TriggerDefinitionModel,
)

from .blueprint import AutomationBlueprint
from .compiled_spec import CompiledAutomationSpec, CompiledNodeSpec
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
                node_specs={
                    ns.node_key: ns.model_dump(mode="json")
                    for ns in spec.nodes
                } if spec.nodes else {},
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

        # Validate DAG
        validate_dag(node_dicts, edge_dicts)
        execution_levels = compute_execution_order(node_dicts, edge_dicts)

        # Build node specs
        agent_specs: dict[str, dict] = {}
        compiled_nodes: list[CompiledNodeSpec] = []

        for node_bp in blueprint.nodes:
            agent = await self.db.scalar(
                select(AgentModel).where(AgentModel.slug == node_bp.agent_slug)
            )
            if not agent:
                raise ValueError(f"Agent '{node_bp.agent_slug}' not found for node '{node_bp.node_key}'")
            if not agent.active_version_id:
                raise ValueError(f"Agent '{node_bp.agent_slug}' has no compiled spec")

            agent_spec = await self.db.get(CompiledAgentSpecModel, agent.active_version_id)
            if not agent_spec:
                raise ValueError(f"Agent spec not found for '{node_bp.agent_slug}'")

            resolved = agent_spec.snapshot or {}
            input_schema = resolved.get("parameters") or resolved.get("input_schema", [])
            output_defs = resolved.get("output_definitions", [{"key": "output", "type": "text"}])

            agent_specs[node_bp.node_key] = {
                "input_schema": input_schema,
                "output_definitions": output_defs,
            }

            # Build wired inputs for this node
            wired_inputs: dict[str, dict] = {}
            for edge in blueprint.edges:
                if edge.target_node_key == node_bp.node_key:
                    wired_inputs[edge.target_input_key] = {
                        "source_node_key": edge.source_node_key,
                        "source_output_key": edge.source_output_key,
                    }

            # Build static inputs for this node
            static_vals: dict[str, object] = {}
            for si in blueprint.static_inputs:
                if si.node_key == node_bp.node_key:
                    static_vals[si.input_key] = si.value

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

        # Resolve deployment input schema (unfilled inputs across all nodes)
        deployment_input_schema = resolve_unfilled_inputs(
            node_dicts, edge_dicts, static_input_dicts, agent_specs
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
