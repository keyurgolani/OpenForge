"""Unified transactional clone executor for catalog templates.

Clones a root entity and all its declared dependencies in a single
database transaction with full ID remapping.
"""

from __future__ import annotations

import logging
import uuid
from copy import deepcopy
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect as sa_inspect

from openforge.db.models import (
    AgentProfileModel,
    MissionDefinitionModel,
    WorkflowDefinitionModel,
    WorkflowEdgeModel,
    WorkflowNodeModel,
    WorkflowVersionModel,
)

logger = logging.getLogger("openforge.catalog.clone_executor")

# Config keys in workflow nodes that reference other entities
_REMAP_KEYS = (
    "child_workflow_id",
    "workflow_id",
    "target_workflow_id",
    "target_profile_id",
)

_MODEL_MAP: dict[str, type] = {
    "profile": AgentProfileModel,
    "workflow": WorkflowDefinitionModel,
    "mission": MissionDefinitionModel,
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def execute_clone(
    db: AsyncSession,
    *,
    root_template_id: str,
    root_catalog_type: str,
    overrides: dict[str, Any] | None = None,
    dependency_resolutions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Execute a full clone plan inside a single transaction.

    Returns a dict with ``root`` (the cloned entity) and ``cloned``
    (a list of all cloned dependency entities).
    """
    overrides = overrides or {}
    dependency_resolutions = dependency_resolutions or []

    # Deduplicate resolutions by template_id (first wins)
    seen_template_ids: set[str] = set()
    unique_resolutions: list[dict[str, Any]] = []
    for res in dependency_resolutions:
        tid = res["template_id"]
        if tid not in seen_template_ids:
            seen_template_ids.add(tid)
            unique_resolutions.append(res)

    # Detect circular: root appearing in its own dependency list
    if root_template_id in seen_template_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Circular dependency: root template appears in dependency_resolutions",
        )

    # Build id_map: template_id -> resolved_id
    id_map: dict[str, uuid.UUID] = {}
    cloned_entities: list[dict[str, Any]] = []

    try:
        # --- Phase 1: resolve dependencies (profiles first, then workflows) ---
        # Sort so profiles come before workflows (workflows may reference profiles)
        profiles_first = sorted(
            unique_resolutions,
            key=lambda r: 0 if r["catalog_type"] == "profile" else 1,
        )

        for res in profiles_first:
            tid = res["template_id"]
            cat = res["catalog_type"]
            resolution = res["resolution"]

            if resolution == "existing":
                existing_id = res.get("existing_id")
                if not existing_id:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"existing_id required for resolution='existing' (template_id={tid})",
                    )
                if not await _entity_exists(db, cat, existing_id):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Existing entity not found: {cat} {existing_id}",
                    )
                id_map[tid] = uuid.UUID(existing_id)

            elif resolution == "clone":
                dep_overrides = res.get("overrides") or {}
                if cat == "profile":
                    new_id = await _clone_profile(db, tid, dep_overrides)
                elif cat == "workflow":
                    new_id = await _clone_workflow(db, tid, dep_overrides, id_map)
                else:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Unsupported dependency catalog_type: {cat}",
                    )
                id_map[tid] = new_id
                cloned_entities.append(await _fetch_entity(db, cat, new_id))
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Unknown resolution type: {resolution}",
                )

        # --- Phase 2: clone root entity ---
        if root_catalog_type == "profile":
            root_new_id = await _clone_profile(db, root_template_id, overrides)
        elif root_catalog_type == "workflow":
            root_new_id = await _clone_workflow(db, root_template_id, overrides, id_map)
        elif root_catalog_type == "mission":
            root_new_id = await _clone_mission(db, root_template_id, overrides, id_map)
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported root catalog_type: {root_catalog_type}",
            )

        # --- Phase 3: single commit ---
        await db.commit()

        root_entity = await _fetch_entity(db, root_catalog_type, root_new_id)
        return {
            "root": root_entity,
            "cloned": cloned_entities,
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Unexpected error during unified clone")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clone failed: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Clone helpers (all use db.add + db.flush, no commit)
# ---------------------------------------------------------------------------

async def _clone_profile(
    db: AsyncSession,
    template_id: str,
    overrides: dict[str, Any],
) -> uuid.UUID:
    """Clone an AgentProfileModel. Returns the new profile ID."""
    source = await db.get(AgentProfileModel, uuid.UUID(template_id))
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile template not found: {template_id}",
        )

    base_slug = overrides.get("slug") or f"{source.slug}-clone"
    slug = await _unique_slug(db, AgentProfileModel, base_slug)

    new_profile = AgentProfileModel(
        id=uuid.uuid4(),
        name=overrides.get("name") or source.name,
        slug=slug,
        description=overrides.get("description") or source.description,
        version="1.0.0",
        role=source.role,
        system_prompt_ref=source.system_prompt_ref,
        model_policy_id=source.model_policy_id,
        memory_policy_id=source.memory_policy_id,
        safety_policy_id=source.safety_policy_id,
        capability_bundle_ids=[str(x) for x in (source.capability_bundle_ids or [])],
        output_contract_id=source.output_contract_id,
        is_system=False,
        is_template=False,
        status="draft",
        icon=source.icon,
        tags=list(source.tags or []),
        catalog_metadata={
            **(source.catalog_metadata or {}),
            "cloned_from_template": template_id,
        },
        is_featured=False,
        is_recommended=False,
        sort_priority=0,
    )
    db.add(new_profile)
    await db.flush()
    return new_profile.id


async def _clone_workflow(
    db: AsyncSession,
    template_id: str,
    overrides: dict[str, Any],
    id_map: dict[str, uuid.UUID],
) -> uuid.UUID:
    """Clone a WorkflowDefinitionModel + active version + nodes + edges.

    Node configs are remapped using *id_map*.  Returns the new workflow ID.
    """
    source = await db.get(WorkflowDefinitionModel, uuid.UUID(template_id))
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow template not found: {template_id}",
        )

    base_slug = overrides.get("slug") or f"{source.slug}-clone"
    slug = await _unique_slug(db, WorkflowDefinitionModel, base_slug)

    new_def = WorkflowDefinitionModel(
        id=uuid.uuid4(),
        workspace_id=overrides.get("workspace_id") or source.workspace_id,
        name=overrides.get("name") or source.name,
        slug=slug,
        description=overrides.get("description") or source.description,
        status=source.status or "draft",
        is_system=False,
        is_template=False,
        template_kind=source.template_kind,
        template_metadata=deepcopy(source.template_metadata or {}),
        tags=list(source.tags or []),
        is_featured=False,
        is_recommended=False,
        sort_priority=0,
        icon=source.icon,
        # Will be updated after version creation
        version=0,
        state_schema={},
        nodes=[],
        edges=[],
        default_input_schema={},
        default_output_schema={},
    )
    db.add(new_def)
    await db.flush()

    # Clone the active version if one exists
    if source.current_version_id:
        source_version = await db.get(WorkflowVersionModel, source.current_version_id)
        if source_version is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workflow version not found for template: {template_id}",
            )

        new_version = WorkflowVersionModel(
            id=uuid.uuid4(),
            workflow_id=new_def.id,
            version_number=1,
            state_schema=deepcopy(source_version.state_schema or {}),
            default_input_schema=deepcopy(source_version.default_input_schema or {}),
            default_output_schema=deepcopy(source_version.default_output_schema or {}),
            status=source_version.status or "draft",
            change_note=f"Cloned from template {source.slug}",
        )
        db.add(new_version)
        await db.flush()

        # Clone nodes
        source_nodes = (
            await db.execute(
                select(WorkflowNodeModel)
                .where(WorkflowNodeModel.workflow_version_id == source_version.id)
                .order_by(WorkflowNodeModel.created_at.asc())
            )
        ).scalars().all()

        node_id_map: dict[uuid.UUID, uuid.UUID] = {}
        for sn in source_nodes:
            new_node_id = uuid.uuid4()
            node_id_map[sn.id] = new_node_id

            remapped_config = _remap_config(deepcopy(sn.config_json or {}), id_map)

            new_node = WorkflowNodeModel(
                id=new_node_id,
                workflow_version_id=new_version.id,
                node_key=sn.node_key,
                node_type=sn.node_type,
                label=sn.label,
                description=sn.description,
                config_json=remapped_config,
                executor_ref=sn.executor_ref,
                input_mapping_json=deepcopy(sn.input_mapping_json or {}),
                output_mapping_json=deepcopy(sn.output_mapping_json or {}),
                status=sn.status or "active",
            )
            db.add(new_node)
        await db.flush()

        # Clone edges
        source_edges = (
            await db.execute(
                select(WorkflowEdgeModel)
                .where(WorkflowEdgeModel.workflow_version_id == source_version.id)
                .order_by(WorkflowEdgeModel.priority.asc())
            )
        ).scalars().all()

        for se in source_edges:
            new_edge = WorkflowEdgeModel(
                id=uuid.uuid4(),
                workflow_version_id=new_version.id,
                from_node_id=node_id_map.get(se.from_node_id, se.from_node_id),
                to_node_id=node_id_map.get(se.to_node_id, se.to_node_id),
                edge_type=se.edge_type,
                condition_json=deepcopy(se.condition_json or {}),
                priority=se.priority,
                label=se.label,
                status=se.status or "active",
            )
            db.add(new_edge)
        await db.flush()

        # Update entry_node_id on the new version
        if source_version.entry_node_id:
            new_version.entry_node_id = node_id_map.get(
                source_version.entry_node_id, source_version.entry_node_id
            )
            await db.flush()

        # Project version onto definition
        new_def.current_version_id = new_version.id
        new_def.version = 1
        new_def.state_schema = new_version.state_schema or {}
        new_def.default_input_schema = new_version.default_input_schema or {}
        new_def.default_output_schema = new_version.default_output_schema or {}
        await db.flush()

    return new_def.id


async def _clone_mission(
    db: AsyncSession,
    template_id: str,
    overrides: dict[str, Any],
    id_map: dict[str, uuid.UUID],
) -> uuid.UUID:
    """Clone a MissionDefinitionModel. Returns the new mission ID.

    Remaps workflow_id and default_profile_ids through *id_map*, resolves
    workflow_version_id to the cloned workflow's current_version_id, and
    resets default_trigger_ids to [].
    """
    source = await db.get(MissionDefinitionModel, uuid.UUID(template_id))
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mission template not found: {template_id}",
        )

    base_slug = overrides.get("slug") or f"{source.slug}-clone"
    slug = await _unique_slug(db, MissionDefinitionModel, base_slug)

    # Remap workflow_id
    source_wf_id_str = str(source.workflow_id)
    if source_wf_id_str in id_map:
        new_workflow_id = id_map[source_wf_id_str]
    else:
        new_workflow_id = source.workflow_id

    # Resolve workflow_version_id to the cloned workflow's current_version_id
    cloned_wf = await db.get(WorkflowDefinitionModel, new_workflow_id)
    new_version_id = cloned_wf.current_version_id if cloned_wf else None

    # Remap default_profile_ids
    new_profile_ids = []
    for pid in (source.default_profile_ids or []):
        pid_str = str(pid)
        if pid_str in id_map:
            new_profile_ids.append(str(id_map[pid_str]))
        else:
            new_profile_ids.append(pid_str)

    new_mission = MissionDefinitionModel(
        id=uuid.uuid4(),
        workspace_id=overrides.get("workspace_id") or source.workspace_id,
        name=overrides.get("name") or source.name,
        slug=slug,
        description=overrides.get("description") or source.description,
        workflow_id=new_workflow_id,
        workflow_version_id=new_version_id,
        default_profile_ids=new_profile_ids,
        default_trigger_ids=[],
        autonomy_mode=source.autonomy_mode or "supervised",
        approval_policy_id=source.approval_policy_id,
        budget_policy_id=source.budget_policy_id,
        output_artifact_types=list(source.output_artifact_types or []),
        is_system=False,
        is_template=False,
        recommended_use_case=source.recommended_use_case,
        status="draft",
        tags=list(source.tags or []),
        icon=source.icon,
        catalog_metadata={
            **(source.catalog_metadata or {}),
            "cloned_from_template": template_id,
        },
        is_featured=False,
        is_recommended=False,
        sort_priority=0,
    )
    db.add(new_mission)
    await db.flush()
    return new_mission.id


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _remap_config(config: dict[str, Any], id_map: dict[str, uuid.UUID]) -> dict[str, Any]:
    """Remap entity reference keys in a node config dict using the id_map."""
    for key in _REMAP_KEYS:
        val = config.get(key)
        if val is not None:
            val_str = str(val)
            if val_str in id_map:
                config[key] = str(id_map[val_str])
    return config


async def _unique_slug(db: AsyncSession, model: type, base_slug: str) -> str:
    """Return a slug guaranteed to be unique by appending a numeric suffix."""
    candidate = base_slug
    suffix = 0
    while True:
        exists = await db.scalar(
            select(model.id).where(model.slug == candidate).limit(1)
        )
        if exists is None:
            return candidate
        suffix += 1
        candidate = f"{base_slug}-{suffix}"
        if suffix > 1000:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Could not generate unique slug from base: {base_slug}",
            )


async def _entity_exists(db: AsyncSession, catalog_type: str, entity_id: str) -> bool:
    """Check whether an entity of the given type exists."""
    model = _MODEL_MAP.get(catalog_type)
    if model is None:
        return False
    row = await db.get(model, uuid.UUID(entity_id))
    return row is not None


async def _fetch_entity(db: AsyncSession, catalog_type: str, entity_id: uuid.UUID) -> dict[str, Any]:
    """Fetch a cloned entity and return a minimal summary dict."""
    model = _MODEL_MAP.get(catalog_type)
    if model is None:
        return {"id": str(entity_id), "catalog_type": catalog_type}
    row = await db.get(model, entity_id)
    if row is None:
        return {"id": str(entity_id), "catalog_type": catalog_type}
    result = {
        attr.key: getattr(row, attr.key)
        for attr in sa_inspect(row).mapper.column_attrs
    }
    # Ensure id is serializable
    for k, v in result.items():
        if isinstance(v, uuid.UUID):
            result[k] = str(v)
    result["catalog_type"] = catalog_type
    return result
