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

        # Attach lightweight graph previews for listing thumbnails
        automation_ids = [r.id for r in rows]
        previews: dict[str, dict] = {}
        if automation_ids:
            nodes_result = await self.db.execute(
                select(AutomationNodeModel)
                .where(AutomationNodeModel.automation_id.in_(automation_ids))
            )
            edges_result = await self.db.execute(
                select(AutomationEdgeModel)
                .where(AutomationEdgeModel.automation_id.in_(automation_ids))
            )
            for n in nodes_result.scalars().all():
                aid = str(n.automation_id)
                if aid not in previews:
                    previews[aid] = {"nodes": [], "edges": []}
                previews[aid]["nodes"].append({"id": str(n.id)})
            for e in edges_result.scalars().all():
                aid = str(e.automation_id)
                if aid not in previews:
                    previews[aid] = {"nodes": [], "edges": []}
                previews[aid]["edges"].append({
                    "source": str(e.source_node_id),
                    "target": str(e.target_node_id),
                })

        results = []
        for row in rows:
            data = self._serialize(row)
            data["graph_preview"] = previews.get(str(row.id))
            results.append(data)
        return results, int(total)

    async def get_automation(self, automation_id: UUID) -> dict[str, Any] | None:
        return await self.get_record(automation_id)

    async def create_automation(self, data: dict[str, Any]) -> dict[str, Any]:
        return await self.create_record(data)

    async def update_automation(self, automation_id: UUID, data: dict[str, Any]) -> dict[str, Any] | None:
        result = await self.update_record(automation_id, data)
        if result is None:
            return None

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

        # Build node_key -> agent_slug lookup (agent nodes only)
        agent_ids = {n.agent_id for n in nodes if n.agent_id is not None}
        agents_by_id = {}
        for aid in agent_ids:
            agent = await self.db.get(AgentModel, aid)
            if agent:
                agents_by_id[aid] = agent

        node_blueprints = []
        for n in nodes:
            if (n.node_type or "agent") != "agent" or n.agent_id is None:
                continue
            agent = agents_by_id.get(n.agent_id)
            if not agent:
                continue
            node_blueprints.append(AutomationNodeBlueprint(
                node_key=n.node_key,
                agent_slug=agent.slug,
                position={"x": n.position_x, "y": n.position_y},
                config=n.config or {},
            ))

        # Build edge blueprints — only edges between agent nodes
        agent_node_ids = {n.id for n in nodes if (n.node_type or "agent") == "agent" and n.agent_id is not None}
        node_id_to_key = {n.id: n.node_key for n in nodes}
        edge_blueprints = []
        for e in edges:
            if e.source_node_id not in agent_node_ids or e.target_node_id not in agent_node_ids:
                continue
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
            trigger={},
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
                    "node_type": n.node_type or "agent",
                    "agent_id": str(n.agent_id) if n.agent_id else None,
                    "sink_type": n.sink_type,
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

        # Create nodes (agent nodes and sink nodes)
        node_key_to_id: dict[str, Any] = {}
        for nd in nodes:
            node_type = nd.get("node_type", "agent")
            node = AutomationNodeModel(
                automation_id=automation_id,
                node_type=node_type,
                agent_id=nd.get("agent_id") if node_type == "agent" else None,
                sink_type=nd.get("sink_type") if node_type == "sink" else None,
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

    async def list_versions(self, automation_id: UUID) -> list[dict] | None:
        """Return all compiled spec versions for an automation, newest first."""
        automation = await self.db.get(AutomationModel, automation_id)
        if automation is None:
            return None
        result = await self.db.execute(
            select(
                CompiledAutomationSpecModel.id,
                CompiledAutomationSpecModel.version,
                CompiledAutomationSpecModel.is_valid,
                CompiledAutomationSpecModel.created_at,
            )
            .where(CompiledAutomationSpecModel.automation_id == automation_id)
            .order_by(CompiledAutomationSpecModel.version.desc())
        )
        return [
            {"id": str(row.id), "version": row.version, "is_valid": row.is_valid, "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in result.all()
        ]

    async def get_version(self, automation_id: UUID, version_id: UUID) -> dict | None:
        """Return a specific compiled spec version with its graph snapshot
        in the same format as the get_graph API response."""
        spec = await self.db.get(CompiledAutomationSpecModel, version_id)
        if spec is None or spec.automation_id != automation_id:
            return None
        snapshot = spec.graph_snapshot or {}
        # Enrich nodes with agent_id (snapshot stores agent_slug)
        enriched_nodes = []
        for node in snapshot.get("nodes", []):
            agent_slug = node.get("agent_slug")
            agent_id = None
            if agent_slug:
                agent = await self.db.scalar(
                    select(AgentModel).where(AgentModel.slug == agent_slug)
                )
                if agent:
                    agent_id = str(agent.id)
            enriched_nodes.append({
                "id": node.get("node_key", ""),
                "node_key": node.get("node_key", ""),
                "agent_id": agent_id or "",
                "position": node.get("position", {"x": 0, "y": 0}),
                "config": node.get("config", {}),
            })
        # Convert edges from node_key references to node_id references
        enriched_edges = []
        for edge in snapshot.get("edges", []):
            enriched_edges.append({
                "id": f"{edge.get('source_node_key', '')}_{edge.get('target_node_key', '')}",
                "source_node_id": edge.get("source_node_key", ""),
                "source_output_key": edge.get("source_output_key", ""),
                "target_node_id": edge.get("target_node_key", ""),
                "target_input_key": edge.get("target_input_key", ""),
            })
        # Build enriched static_inputs with node_id = node_key
        enriched_statics = []
        for si in snapshot.get("static_inputs", []):
            enriched_statics.append({
                "node_id": si.get("node_key", ""),
                "input_key": si.get("input_key", ""),
                "static_value": si.get("value"),
            })
        return {
            "id": str(spec.id),
            "version": spec.version,
            "is_valid": spec.is_valid,
            "graph_snapshot": {
                "automation_id": str(automation_id),
                "graph_version": spec.version,
                "nodes": enriched_nodes,
                "edges": enriched_edges,
                "static_inputs": enriched_statics,
            },
            "created_at": spec.created_at.isoformat() if spec.created_at else None,
        }

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
        return data
