"""Workflow domain service."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    WorkflowDefinitionModel,
    WorkflowEdgeModel,
    WorkflowNodeModel,
    WorkflowVersionModel,
)


class WorkflowService:
    """Service for managing workflow definitions and versions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _serialize_node(self, instance: WorkflowNodeModel) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "workflow_version_id": str(instance.workflow_version_id),
            "node_key": instance.node_key,
            "node_type": instance.node_type,
            "label": instance.label,
            "description": instance.description,
            "config": instance.config_json or {},
            "executor_ref": instance.executor_ref,
            "input_mapping": instance.input_mapping_json or {},
            "output_mapping": instance.output_mapping_json or {},
            "status": instance.status,
            "created_at": instance.created_at.isoformat() if instance.created_at else None,
            "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    def _node_type_value(self, value: Any) -> str | None:
        return getattr(value, "value", value)

    def _validate_version_payload(self, version_data: dict[str, Any]) -> None:
        nodes = version_data.get("nodes", [])
        join_groups = {
            (node.get("config", {}) or {}).get("join_group_id")
            for node in nodes
            if self._node_type_value(node.get("node_type")) in {"join", "reduce"}
        }
        join_groups.discard(None)

        for node in nodes:
            node_type = self._node_type_value(node.get("node_type"))
            config = node.get("config", {}) or {}
            if node_type == "fanout":
                if not config.get("child_workflow_id"):
                    raise ValueError("Fanout node requires child_workflow_id")
                if not config.get("join_group_id"):
                    raise ValueError("Fanout node requires join_group_id")
                if config["join_group_id"] not in join_groups:
                    raise ValueError("Fanout node requires a matching join or reduce group")
            if node_type in {"delegate_call", "subworkflow"} and not (
                config.get("child_workflow_id") or config.get("workflow_id")
            ):
                raise ValueError(f"{node_type} node requires child_workflow_id")
            if node_type == "handoff" and not any(
                config.get(key) for key in ("target_node_key", "target_profile_id", "target_workflow_id")
            ):
                raise ValueError("Handoff node requires an explicit target")
            if node_type == "join" and not config.get("join_group_id"):
                raise ValueError("Join node requires join_group_id")
            if node_type == "reduce":
                if not config.get("strategy"):
                    raise ValueError("Reduce node requires strategy")
                if not (config.get("source_key") or config.get("join_group_id")):
                    raise ValueError("Reduce node requires source_key or join_group_id")

    def _serialize_edge(self, instance: WorkflowEdgeModel) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "workflow_version_id": str(instance.workflow_version_id),
            "from_node_id": str(instance.from_node_id),
            "to_node_id": str(instance.to_node_id),
            "edge_type": instance.edge_type,
            "condition": instance.condition_json or {},
            "priority": instance.priority,
            "label": instance.label,
            "status": instance.status,
            "created_at": instance.created_at.isoformat() if instance.created_at else None,
            "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    def _serialize_version(
        self,
        instance: WorkflowVersionModel,
        *,
        nodes: list[dict[str, Any]] | None = None,
        edges: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        node_list = list(nodes or [])
        edge_list = list(edges or [])
        entry_node_id_str = str(instance.entry_node_id) if instance.entry_node_id else None
        entry_node = next((node for node in node_list if node["id"] == entry_node_id_str), None)
        return {
            "id": str(instance.id),
            "workflow_id": str(instance.workflow_id),
            "version_number": instance.version_number,
            "state_schema": instance.state_schema or {},
            "entry_node_id": entry_node_id_str,
            "entry_node": entry_node,
            "default_input_schema": instance.default_input_schema or {},
            "default_output_schema": instance.default_output_schema or {},
            "status": instance.status,
            "change_note": instance.change_note,
            "nodes": node_list,
            "edges": edge_list,
            "created_at": instance.created_at.isoformat() if instance.created_at else None,
            "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    async def _load_nodes(self, workflow_version_id: UUID) -> list[dict[str, Any]]:
        query = select(WorkflowNodeModel).where(WorkflowNodeModel.workflow_version_id == workflow_version_id).order_by(WorkflowNodeModel.created_at.asc())
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize_node(row) for row in rows]

    async def _load_edges(self, workflow_version_id: UUID) -> list[dict[str, Any]]:
        query = select(WorkflowEdgeModel).where(WorkflowEdgeModel.workflow_version_id == workflow_version_id).order_by(WorkflowEdgeModel.priority.asc())
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize_edge(row) for row in rows]

    async def _load_version(self, version_id: UUID) -> dict[str, Any] | None:
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None:
            return None
        nodes = await self._load_nodes(version.id)
        edges = await self._load_edges(version.id)
        return self._serialize_version(version, nodes=nodes, edges=edges)

    async def _apply_version_projection(
        self,
        definition: WorkflowDefinitionModel,
        *,
        version_model: WorkflowVersionModel,
        version_data: dict[str, Any],
    ) -> None:
        definition.current_version_id = version_model.id
        definition.version = version_model.version_number
        definition.state_schema = version_model.state_schema or {}
        definition.default_input_schema = version_model.default_input_schema or {}
        definition.default_output_schema = version_model.default_output_schema or {}
        definition.nodes = version_data["nodes"]
        definition.edges = version_data["edges"]
        definition.entry_node = version_data["entry_node"]["node_key"] if version_data.get("entry_node") else None

    async def _create_version_models(
        self,
        workflow_id: UUID,
        version_data: dict[str, Any],
        *,
        version_number: int,
    ) -> tuple[WorkflowVersionModel, list[WorkflowNodeModel], list[WorkflowEdgeModel], dict[str, Any]]:
        version = WorkflowVersionModel(
            workflow_id=workflow_id,
            version_number=version_number,
            state_schema=version_data.get("state_schema", {}),
            default_input_schema=version_data.get("default_input_schema", {}),
            default_output_schema=version_data.get("default_output_schema", {}),
            status=version_data.get("status", "draft"),
            change_note=version_data.get("change_note"),
        )
        self.db.add(version)
        await self.db.flush()

        node_models: list[WorkflowNodeModel] = []
        for node_data in version_data.get("nodes", []):
            node = WorkflowNodeModel(
                id=node_data.get("id") or uuid4(),
                workflow_version_id=version.id,
                node_key=node_data["node_key"],
                node_type=getattr(node_data.get("node_type"), "value", node_data.get("node_type")),
                label=node_data["label"],
                description=node_data.get("description"),
                config_json=node_data.get("config", {}),
                executor_ref=node_data.get("executor_ref"),
                input_mapping_json=node_data.get("input_mapping", {}),
                output_mapping_json=node_data.get("output_mapping", {}),
                status=getattr(node_data.get("status"), "value", node_data.get("status", "active")),
            )
            self.db.add(node)
            node_models.append(node)
        await self.db.flush()

        if version_data.get("entry_node_id") is not None:
            version.entry_node_id = version_data["entry_node_id"]
        elif node_models:
            version.entry_node_id = node_models[0].id

        edge_models: list[WorkflowEdgeModel] = []
        for edge_data in version_data.get("edges", []):
            edge = WorkflowEdgeModel(
                id=edge_data.get("id") or uuid4(),
                workflow_version_id=version.id,
                from_node_id=edge_data["from_node_id"],
                to_node_id=edge_data["to_node_id"],
                edge_type=edge_data.get("edge_type", "success"),
                condition_json=edge_data.get("condition", {}),
                priority=edge_data.get("priority", 100),
                label=edge_data.get("label"),
                status=getattr(edge_data.get("status"), "value", edge_data.get("status", "active")),
            )
            self.db.add(edge)
            edge_models.append(edge)
        await self.db.flush()

        serialized_nodes = [self._serialize_node(node) for node in node_models]
        serialized_edges = [self._serialize_edge(edge) for edge in edge_models]
        return version, node_models, edge_models, self._serialize_version(version, nodes=serialized_nodes, edges=serialized_edges)

    async def _build_workflow_response(self, definition: WorkflowDefinitionModel) -> dict[str, Any]:
        current_version = await self._load_version(definition.current_version_id) if definition.current_version_id else None
        return {
            "id": str(definition.id),
            "workspace_id": str(definition.workspace_id) if definition.workspace_id else None,
            "name": definition.name,
            "slug": definition.slug,
            "description": definition.description,
            "status": definition.status,
            "current_version_id": str(definition.current_version_id) if definition.current_version_id else None,
            "is_system": getattr(definition, "is_system", False),
            "is_template": getattr(definition, "is_template", False),
            "template_kind": getattr(definition, "template_kind", None),
            "template_metadata": getattr(definition, "template_metadata", {}) or {},
            "tags": getattr(definition, "tags", []) or [],
            "is_featured": getattr(definition, "is_featured", False),
            "is_recommended": getattr(definition, "is_recommended", False),
            "sort_priority": getattr(definition, "sort_priority", 0),
            "icon": getattr(definition, "icon", None),
            "current_version": current_version,
            "created_at": definition.created_at.isoformat() if getattr(definition, "created_at", None) else None,
            "updated_at": definition.updated_at.isoformat() if getattr(definition, "updated_at", None) else None,
            "created_by": str(definition.created_by) if getattr(definition, "created_by", None) else None,
            "updated_by": str(definition.updated_by) if getattr(definition, "updated_by", None) else None,
        }

    async def list_workflows(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id: UUID | None = None,
        status: str | None = None,
        is_system: bool | None = None,
        is_template: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(WorkflowDefinitionModel).order_by(WorkflowDefinitionModel.updated_at.desc())
        count_query = select(func.count()).select_from(WorkflowDefinitionModel)
        if workspace_id is not None:
            query = query.where(WorkflowDefinitionModel.workspace_id == workspace_id)
            count_query = count_query.where(WorkflowDefinitionModel.workspace_id == workspace_id)
        if status is not None:
            query = query.where(WorkflowDefinitionModel.status == status)
            count_query = count_query.where(WorkflowDefinitionModel.status == status)
        if is_system is not None:
            query = query.where(WorkflowDefinitionModel.is_system == is_system)
            count_query = count_query.where(WorkflowDefinitionModel.is_system == is_system)
        if is_template is not None:
            query = query.where(WorkflowDefinitionModel.is_template == is_template)
            count_query = count_query.where(WorkflowDefinitionModel.is_template == is_template)

        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        total = await self.db.scalar(count_query)
        workflows = [await self._build_workflow_response(row) for row in rows]
        return workflows, int(total or 0)

    async def get_workflow(self, workflow_id: UUID) -> dict[str, Any] | None:
        definition = await self.db.get(WorkflowDefinitionModel, workflow_id)
        if definition is None:
            return None
        return await self._build_workflow_response(definition)

    async def create_workflow(self, workflow_data: dict[str, Any]) -> dict[str, Any]:
        version_payload = workflow_data["version"]
        definition = WorkflowDefinitionModel(
            id=workflow_data.get("id") or uuid4(),
            workspace_id=workflow_data.get("workspace_id"),
            name=workflow_data["name"],
            slug=workflow_data["slug"],
            description=workflow_data.get("description"),
            status=getattr(workflow_data.get("status"), "value", workflow_data.get("status", "draft")),
            is_system=workflow_data.get("is_system", False),
            is_template=workflow_data.get("is_template", False),
            template_kind=workflow_data.get("template_kind"),
            template_metadata=workflow_data.get("template_metadata", {}),
            tags=workflow_data.get("tags", []),
            is_featured=workflow_data.get("is_featured", False),
            is_recommended=workflow_data.get("is_recommended", False),
            sort_priority=workflow_data.get("sort_priority", 0),
            icon=workflow_data.get("icon"),
            version=0,
            state_schema={},
            nodes=[],
            edges=[],
            default_input_schema={},
            default_output_schema={},
        )
        self.db.add(definition)
        await self.db.flush()

        self._validate_version_payload(version_payload)
        version_model, _nodes, _edges, version_data = await self._create_version_models(
            definition.id,
            version_payload,
            version_number=1,
        )
        await self._apply_version_projection(definition, version_model=version_model, version_data=version_data)

        await self.db.commit()
        await self.db.refresh(definition)
        response = await self._build_workflow_response(definition)
        response["current_version"] = version_data
        return response

    async def update_workflow(self, workflow_id: UUID, workflow_data: dict[str, Any]) -> dict[str, Any] | None:
        definition = await self.db.get(WorkflowDefinitionModel, workflow_id)
        if definition is None:
            return None
        for key in ("name", "slug", "description", "status", "is_system", "is_template", "template_kind", "template_metadata", "tags", "is_featured", "is_recommended", "sort_priority", "icon"):
            if key in workflow_data and workflow_data[key] is not None:
                setattr(definition, key, getattr(workflow_data[key], "value", workflow_data[key]))
        await self.db.commit()
        await self.db.refresh(definition)
        return await self._build_workflow_response(definition)

    async def delete_workflow(self, workflow_id: UUID) -> bool:
        definition = await self.db.get(WorkflowDefinitionModel, workflow_id)
        if definition is None:
            return False
        definition.status = "deleted"
        await self.db.commit()
        return True

    async def list_versions(self, workflow_id: UUID) -> list[dict[str, Any]]:
        query = (
            select(WorkflowVersionModel)
            .where(WorkflowVersionModel.workflow_id == workflow_id)
            .order_by(WorkflowVersionModel.version_number.desc())
        )
        rows = (await self.db.execute(query)).scalars().all()
        return [await self._load_version(row.id) for row in rows if row is not None]

    async def get_version(self, workflow_id: UUID, version_id: UUID) -> dict[str, Any] | None:
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None or version.workflow_id != workflow_id:
            return None
        return await self._load_version(version_id)

    async def create_version(self, workflow_id: UUID, version_data: dict[str, Any]) -> dict[str, Any] | None:
        definition = await self.db.get(WorkflowDefinitionModel, workflow_id)
        if definition is None:
            return None
        self._validate_version_payload(version_data)
        version_model, _nodes, _edges, serialized = await self._create_version_models(
            workflow_id,
            version_data,
            version_number=max(1, int(getattr(definition, "version", 0)) + 1),
        )
        await self.db.commit()
        return serialized

    async def activate_version(self, workflow_id: UUID, version_id: UUID) -> dict[str, Any] | None:
        definition = await self.db.get(WorkflowDefinitionModel, workflow_id)
        version_model = await self.db.get(WorkflowVersionModel, version_id)
        if definition is None or version_model is None or version_model.workflow_id != workflow_id:
            return None
        version_data = await self._load_version(version_id)
        if version_data is None:
            return None
        await self._apply_version_projection(definition, version_model=version_model, version_data=version_data)
        version_model.status = "active"
        await self.db.commit()
        await self.db.refresh(definition)
        response = await self._build_workflow_response(definition)
        response["current_version"] = version_data
        return response

    async def list_nodes(self, workflow_id: UUID, version_id: UUID) -> list[dict[str, Any]]:
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None or version.workflow_id != workflow_id:
            return []
        return await self._load_nodes(version_id)

    async def create_node(self, workflow_id: UUID, version_id: UUID, node_data: dict[str, Any]) -> dict[str, Any] | None:
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None or version.workflow_id != workflow_id:
            return None
        node = WorkflowNodeModel(
            id=node_data.get("id") or uuid4(),
            workflow_version_id=version_id,
            node_key=node_data["node_key"],
            node_type=getattr(node_data.get("node_type"), "value", node_data.get("node_type")),
            label=node_data["label"],
            description=node_data.get("description"),
            config_json=node_data.get("config", {}),
            executor_ref=node_data.get("executor_ref"),
            input_mapping_json=node_data.get("input_mapping", {}),
            output_mapping_json=node_data.get("output_mapping", {}),
            status=getattr(node_data.get("status"), "value", node_data.get("status", "active")),
        )
        self.db.add(node)
        await self.db.commit()
        await self.db.refresh(node)
        return self._serialize_node(node)

    async def update_node(self, workflow_id: UUID, version_id: UUID, node_id: UUID, node_data: dict[str, Any]) -> dict[str, Any] | None:
        node = await self.db.get(WorkflowNodeModel, node_id)
        if node is None or node.workflow_version_id != version_id:
            return None
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None or version.workflow_id != workflow_id:
            return None
        mapping = {
            "config": "config_json",
            "input_mapping": "input_mapping_json",
            "output_mapping": "output_mapping_json",
        }
        for key, value in node_data.items():
            if value is None:
                continue
            setattr(node, mapping.get(key, key), getattr(value, "value", value))
        await self.db.commit()
        await self.db.refresh(node)
        return self._serialize_node(node)

    async def delete_node(self, workflow_id: UUID, version_id: UUID, node_id: UUID) -> bool:
        node = await self.db.get(WorkflowNodeModel, node_id)
        version = await self.db.get(WorkflowVersionModel, version_id)
        if node is None or version is None or version.workflow_id != workflow_id or node.workflow_version_id != version_id:
            return False
        await self.db.delete(node)
        await self.db.commit()
        return True

    async def list_edges(self, workflow_id: UUID, version_id: UUID) -> list[dict[str, Any]]:
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None or version.workflow_id != workflow_id:
            return []
        return await self._load_edges(version_id)

    async def create_edge(self, workflow_id: UUID, version_id: UUID, edge_data: dict[str, Any]) -> dict[str, Any] | None:
        version = await self.db.get(WorkflowVersionModel, version_id)
        if version is None or version.workflow_id != workflow_id:
            return None
        edge = WorkflowEdgeModel(
            id=edge_data.get("id") or uuid4(),
            workflow_version_id=version_id,
            from_node_id=edge_data["from_node_id"],
            to_node_id=edge_data["to_node_id"],
            edge_type=edge_data.get("edge_type", "success"),
            condition_json=edge_data.get("condition", {}),
            priority=edge_data.get("priority", 100),
            label=edge_data.get("label"),
            status=getattr(edge_data.get("status"), "value", edge_data.get("status", "active")),
        )
        self.db.add(edge)
        await self.db.commit()
        await self.db.refresh(edge)
        return self._serialize_edge(edge)

    async def update_edge(self, workflow_id: UUID, version_id: UUID, edge_id: UUID, edge_data: dict[str, Any]) -> dict[str, Any] | None:
        edge = await self.db.get(WorkflowEdgeModel, edge_id)
        version = await self.db.get(WorkflowVersionModel, version_id)
        if edge is None or version is None or version.workflow_id != workflow_id or edge.workflow_version_id != version_id:
            return None
        mapping = {"condition": "condition_json"}
        for key, value in edge_data.items():
            if value is None:
                continue
            setattr(edge, mapping.get(key, key), getattr(value, "value", value))
        await self.db.commit()
        await self.db.refresh(edge)
        return self._serialize_edge(edge)

    async def delete_edge(self, workflow_id: UUID, version_id: UUID, edge_id: UUID) -> bool:
        edge = await self.db.get(WorkflowEdgeModel, edge_id)
        version = await self.db.get(WorkflowVersionModel, version_id)
        if edge is None or version is None or version.workflow_id != workflow_id or edge.workflow_version_id != version_id:
            return False
        await self.db.delete(edge)
        await self.db.commit()
        return True

    async def get_runtime_workflow(self, workflow_id: UUID, workflow_version_id: UUID | None = None) -> dict[str, Any] | None:
        definition = await self.get_workflow(workflow_id)
        if definition is None:
            return None
        if workflow_version_id is not None:
            version = await self.get_version(workflow_id, workflow_version_id)
            if version is None:
                return None
            definition["current_version"] = version
            definition["current_version_id"] = version["id"]
        return definition

    async def list_templates(
        self,
        skip: int = 0,
        limit: int = 100,
        template_kind: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        workflows, total = await self.list_workflows(skip=skip, limit=limit, is_template=True)
        if template_kind is None:
            return workflows, total
        filtered = [workflow for workflow in workflows if workflow.get("template_kind") == template_kind]
        return filtered, len(filtered)

    async def get_template(self, workflow_id: UUID) -> dict[str, Any] | None:
        workflow = await self.get_workflow(workflow_id)
        if workflow is None or not workflow.get("is_template"):
            return None
        return workflow

    async def _unique_slug(self, base_slug: str) -> str:
        """Return a slug guaranteed to be unique by appending a numeric suffix."""
        candidate = base_slug
        suffix = 0
        while True:
            exists = await self.db.scalar(
                select(WorkflowDefinitionModel.id).where(WorkflowDefinitionModel.slug == candidate).limit(1)
            )
            if exists is None:
                return candidate
            suffix += 1
            candidate = f"{base_slug}-{suffix}"

    async def clone_template(self, workflow_id: UUID, clone_data: dict[str, Any]) -> dict[str, Any] | None:
        template = await self.get_template(workflow_id)
        if template is None or template.get("current_version") is None:
            return None

        version = deepcopy(template["current_version"])
        node_id_map: dict[Any, UUID] = {}
        cloned_nodes: list[dict[str, Any]] = []
        for node in version.get("nodes", []):
            new_id = uuid4()
            node_id_map[node["id"]] = new_id
            cloned_nodes.append({**node, "id": new_id})

        cloned_edges: list[dict[str, Any]] = []
        for edge in version.get("edges", []):
            cloned_edges.append(
                {
                    **edge,
                    "id": uuid4(),
                    "from_node_id": node_id_map.get(edge["from_node_id"], edge["from_node_id"]),
                    "to_node_id": node_id_map.get(edge["to_node_id"], edge["to_node_id"]),
                }
            )

        desired_slug = clone_data.get("slug") or f"{template['slug']}-clone"
        unique_slug = await self._unique_slug(desired_slug)

        payload = {
            "workspace_id": clone_data.get("workspace_id"),
            "name": clone_data.get("name") or template["name"],
            "slug": unique_slug,
            "description": template.get("description"),
            "status": template.get("status", "draft"),
            "is_system": False,
            "is_template": False,
            "template_kind": template.get("template_kind"),
            "template_metadata": template.get("template_metadata", {}),
            "version": {
                "state_schema": deepcopy(version.get("state_schema", {})),
                "entry_node_id": node_id_map.get(version.get("entry_node_id"), version.get("entry_node_id")),
                "default_input_schema": deepcopy(version.get("default_input_schema", {})),
                "default_output_schema": deepcopy(version.get("default_output_schema", {})),
                "status": version.get("status", "draft"),
                "change_note": f"Cloned from template {template['slug']}",
                "nodes": cloned_nodes,
                "edges": cloned_edges,
            },
        }
        return await self.create_workflow(payload)
