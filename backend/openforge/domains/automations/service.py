"""Automation domain service."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select

from openforge.db.models import (
    AgentModel,
    AutomationEdgeModel,
    AutomationModel,
    AutomationNodeInputModel,
    AutomationNodeModel,
    CompiledAutomationSpecModel,
)
from openforge.domains.common.crud import CrudDomainService

from .blueprint import AutomationBlueprint
from .compiler import AutomationBlueprintCompiler

logger = logging.getLogger("openforge.automations.service")


class AutomationService(CrudDomainService):
    """Service for managing automations and triggering compilation."""

    model = AutomationModel

    async def list_automations(
        self,
        skip: int = 0,
        limit: int = 100,
        status: str | None = None,
        is_template: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(AutomationModel).order_by(AutomationModel.updated_at.desc())
        count_query = select(func.count()).select_from(AutomationModel)

        if status is not None:
            query = query.where(AutomationModel.status == status)
            count_query = count_query.where(AutomationModel.status == status)
        if is_template is not None:
            query = query.where(AutomationModel.is_template == is_template)
            count_query = count_query.where(AutomationModel.is_template == is_template)

        total = await self.db.scalar(count_query) or 0
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return [self._serialize(row) for row in rows], int(total)

    async def get_automation(self, automation_id: UUID) -> dict[str, Any] | None:
        return await self.get_record(automation_id)

    async def create_automation(self, data: dict[str, Any]) -> dict[str, Any]:
        return await self.create_record(data)

    async def update_automation(self, automation_id: UUID, data: dict[str, Any]) -> dict[str, Any] | None:
        result = await self.update_record(automation_id, data)
        if result is None:
            return None

        # Auto-recompile if trigger config changed
        recompile_keys = {"trigger_config"}
        if recompile_keys & set(data.keys()):
            try:
                await self.compile_automation(automation_id)
                automation = await self.db.get(AutomationModel, automation_id)
                result = self._serialize(automation)
            except Exception as e:
                logger.warning("Auto-recompilation failed for automation %s: %s", automation_id, e)

        return result

    async def delete_automation(self, automation_id: UUID) -> bool:
        return await self.delete_record(automation_id)

    async def compile_automation(self, automation_id: UUID) -> dict[str, Any] | None:
        """Force recompilation of an automation from its stored graph."""
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None

        return await self._compile_multi_node(automation)

    async def _compile_multi_node(self, automation: AutomationModel) -> dict[str, Any]:
        """Compile a multi-node automation from its stored graph."""
        from .blueprint import AutomationEdgeBlueprint, AutomationNodeBlueprint, AutomationStaticInput

        nodes = (await self.db.execute(
            select(AutomationNodeModel).where(AutomationNodeModel.automation_id == automation.id)
        )).scalars().all()

        edges = (await self.db.execute(
            select(AutomationEdgeModel).where(AutomationEdgeModel.automation_id == automation.id)
        )).scalars().all()

        static_inputs = (await self.db.execute(
            select(AutomationNodeInputModel).where(AutomationNodeInputModel.automation_id == automation.id)
        )).scalars().all()

        # Build node_key -> agent_slug lookup
        agent_ids = {n.agent_id for n in nodes}
        agents_by_id = {}
        for aid in agent_ids:
            agent = await self.db.get(AgentModel, aid)
            if agent:
                agents_by_id[aid] = agent

        node_blueprints = []
        for n in nodes:
            agent = agents_by_id.get(n.agent_id)
            if not agent:
                continue
            node_blueprints.append(AutomationNodeBlueprint(
                node_key=n.node_key,
                agent_slug=agent.slug,
                position={"x": n.position_x, "y": n.position_y},
                config=n.config or {},
            ))

        # Build edge blueprints - we need node_key lookup
        node_id_to_key = {n.id: n.node_key for n in nodes}
        edge_blueprints = []
        for e in edges:
            edge_blueprints.append(AutomationEdgeBlueprint(
                source_node_key=node_id_to_key.get(e.source_node_id, ""),
                source_output_key=e.source_output_key,
                target_node_key=node_id_to_key.get(e.target_node_id, ""),
                target_input_key=e.target_input_key,
            ))

        static_input_blueprints = []
        for si in static_inputs:
            node_key = node_id_to_key.get(si.node_id, "")
            static_input_blueprints.append(AutomationStaticInput(
                node_key=node_key,
                input_key=si.input_key,
                value=si.static_value,
            ))

        blueprint = AutomationBlueprint(
            name=automation.name,
            slug=automation.slug,
            description=automation.description,
            trigger=automation.trigger_config or {},
            tags=automation.tags or [],
            icon=automation.icon,
            nodes=node_blueprints,
            edges=edge_blueprints,
            static_inputs=static_input_blueprints,
        )

        compiler = AutomationBlueprintCompiler(self.db)
        await compiler.compile(automation, blueprint)
        await self.db.refresh(automation)

        return {
            "automation_id": automation.id,
            "spec_id": automation.active_spec_id,
            "version": await self._latest_version(automation.id),
            "compilation_status": automation.compilation_status,
            "compilation_error": automation.compilation_error,
        }

    async def set_status(self, automation_id: UUID, new_status: str) -> dict[str, Any] | None:
        """Update automation status (pause/resume/activate)."""
        return await self.update_record(automation_id, {"status": new_status})

    async def get_health(self, automation_id: UUID) -> dict[str, Any] | None:
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None
        return {
            "automation_id": automation.id,
            "health_status": automation.health_status,
            "last_run_at": automation.last_run_at,
            "last_success_at": automation.last_success_at,
            "last_failure_at": automation.last_failure_at,
            "last_error_summary": automation.last_error_summary,
            "compilation_status": automation.compilation_status,
        }

    async def get_active_spec(self, automation_id: UUID) -> dict[str, Any] | None:
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None or automation.active_spec_id is None:
            return None
        spec = await self.db.get(CompiledAutomationSpecModel, automation.active_spec_id)
        if spec is None:
            return None
        return self._serialize(spec)

    async def list_templates(
        self, skip: int = 0, limit: int = 100
    ) -> tuple[list[dict[str, Any]], int]:
        return await self.list_automations(skip=skip, limit=limit, is_template=True)

    # ── Graph CRUD ──

    async def get_graph(self, automation_id: UUID) -> dict[str, Any] | None:
        """Return the graph (nodes, edges, static_inputs) for the canvas."""
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None

        nodes = (await self.db.execute(
            select(AutomationNodeModel).where(AutomationNodeModel.automation_id == automation_id)
        )).scalars().all()

        edges = (await self.db.execute(
            select(AutomationEdgeModel).where(AutomationEdgeModel.automation_id == automation_id)
        )).scalars().all()

        static_inputs = (await self.db.execute(
            select(AutomationNodeInputModel).where(AutomationNodeInputModel.automation_id == automation_id)
        )).scalars().all()

        return {
            "automation_id": automation_id,
            "graph_version": automation.graph_version,
            "nodes": [
                {
                    "id": str(n.id),
                    "node_key": n.node_key,
                    "agent_id": str(n.agent_id),
                    "position": {"x": n.position_x, "y": n.position_y},
                    "config": n.config or {},
                }
                for n in nodes
            ],
            "edges": [
                {
                    "id": str(e.id),
                    "source_node_id": str(e.source_node_id),
                    "source_output_key": e.source_output_key,
                    "target_node_id": str(e.target_node_id),
                    "target_input_key": e.target_input_key,
                }
                for e in edges
            ],
            "static_inputs": [
                {
                    "id": str(si.id),
                    "node_id": str(si.node_id),
                    "input_key": si.input_key,
                    "static_value": si.static_value,
                }
                for si in static_inputs
            ],
        }

    async def save_graph(
        self,
        automation_id: UUID,
        nodes: list[dict],
        edges: list[dict],
        static_inputs: list[dict],
    ) -> dict[str, Any]:
        """Replace the entire graph for an automation."""
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            raise ValueError(f"Automation {automation_id} not found")

        # Delete existing graph
        await self.db.execute(
            delete(AutomationNodeInputModel).where(AutomationNodeInputModel.automation_id == automation_id)
        )
        await self.db.execute(
            delete(AutomationEdgeModel).where(AutomationEdgeModel.automation_id == automation_id)
        )
        await self.db.execute(
            delete(AutomationNodeModel).where(AutomationNodeModel.automation_id == automation_id)
        )

        # Create nodes
        node_key_to_id: dict[str, Any] = {}
        for nd in nodes:
            node = AutomationNodeModel(
                automation_id=automation_id,
                agent_id=nd["agent_id"],
                node_key=nd["node_key"],
                position_x=nd.get("position", {}).get("x", 0),
                position_y=nd.get("position", {}).get("y", 0),
                config=nd.get("config", {}),
            )
            self.db.add(node)
            await self.db.flush()
            node_key_to_id[nd["node_key"]] = node.id

        # Create edges (resolve node_keys to IDs if needed)
        for ed in edges:
            source_id = ed.get("source_node_id") or node_key_to_id.get(ed.get("source_node_key", ""))
            target_id = ed.get("target_node_id") or node_key_to_id.get(ed.get("target_node_key", ""))
            edge = AutomationEdgeModel(
                automation_id=automation_id,
                source_node_id=source_id,
                source_output_key=ed.get("source_output_key", "output"),
                target_node_id=target_id,
                target_input_key=ed["target_input_key"],
            )
            self.db.add(edge)

        # Create static inputs
        for si in static_inputs:
            node_id = si.get("node_id") or node_key_to_id.get(si.get("node_key", ""))
            inp = AutomationNodeInputModel(
                automation_id=automation_id,
                node_id=node_id,
                input_key=si["input_key"],
                static_value=si.get("static_value"),
            )
            self.db.add(inp)

        automation.graph_version = (automation.graph_version or 0) + 1
        await self.db.commit()

        # Auto-recompile after graph save
        try:
            await self.compile_automation(automation_id)
        except Exception as e:
            logger.warning("Auto-recompilation failed after graph save for automation %s: %s", automation_id, e)

        return await self.get_graph(automation_id)

    async def get_deployment_schema(self, automation_id: UUID) -> list[dict] | None:
        """Return unfilled inputs from the active compiled spec."""
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None
        if automation.active_spec_id is None:
            return []
        spec = await self.db.get(CompiledAutomationSpecModel, automation.active_spec_id)
        if spec is None:
            return []
        resolved = spec.resolved_config or {}
        return resolved.get("deployment_input_schema", [])

    async def _latest_version(self, automation_id: UUID) -> int:
        result = await self.db.scalar(
            select(func.max(CompiledAutomationSpecModel.version))
            .where(CompiledAutomationSpecModel.automation_id == automation_id)
        )
        return result or 0

    def _serialize(self, instance: Any) -> dict[str, Any]:
        data = super()._serialize(instance)
        if isinstance(instance, AutomationModel):
            data["tags"] = data.get("tags") or []
            data["trigger_config"] = data.get("trigger_config") or {}
        return data
