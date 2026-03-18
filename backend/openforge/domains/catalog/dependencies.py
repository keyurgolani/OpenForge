"""Recursive dependency tree resolution for catalog templates."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from uuid import UUID

MAX_DEPTH = 10

# Node config keys that reference cloneable entities
WORKFLOW_REF_KEYS = ("child_workflow_id", "workflow_id", "target_workflow_id")
PROFILE_REF_KEYS = ("target_profile_id",)


@dataclass
class DependencyNode:
    role: str  # workflow, default_profile, node_workflow_ref, node_profile_ref
    template_id: str
    template_name: Optional[str]
    template_description: Optional[str]
    catalog_type: str  # profile, workflow
    missing: bool = False
    circular: bool = False
    depth_limit_reached: bool = False
    node_label: Optional[str] = None
    node_type: Optional[str] = None
    config_key: Optional[str] = None
    children: list[DependencyNode] = field(default_factory=list)


@dataclass
class DependencyTree:
    root: dict[str, Any]
    dependencies: list[DependencyNode]


LookupFn = Callable[[str, UUID], Optional[dict[str, Any]]]


def resolve_dependency_tree(
    catalog_type: str,
    entity: dict[str, Any],
    lookup_fn: LookupFn,
) -> DependencyTree:
    root = {
        "id": str(entity["id"]),
        "catalog_type": catalog_type,
        "name": entity.get("name"),
        "description": entity.get("description"),
    }
    visited: set[str] = {str(entity["id"])}
    deps = _collect_dependencies(catalog_type, entity, lookup_fn, visited, depth=0)
    return DependencyTree(root=root, dependencies=deps)


def _collect_dependencies(
    catalog_type: str,
    entity: dict[str, Any],
    lookup_fn: LookupFn,
    visited: set[str],
    depth: int,
) -> list[DependencyNode]:
    if catalog_type == "profile":
        return []
    if catalog_type == "mission":
        return _collect_mission_deps(entity, lookup_fn, visited, depth)
    if catalog_type == "workflow":
        return _collect_workflow_node_deps(entity, lookup_fn, visited, depth)
    return []


def _collect_mission_deps(
    mission: dict[str, Any],
    lookup_fn: LookupFn,
    visited: set[str],
    depth: int,
) -> list[DependencyNode]:
    deps: list[DependencyNode] = []
    wf_id = mission.get("workflow_id")
    if wf_id:
        wf_node = _resolve_entity("workflow", str(wf_id), "workflow", lookup_fn, visited, depth)
        deps.append(wf_node)
    for pid in (mission.get("default_profile_ids") or []):
        p_node = _resolve_entity("profile", str(pid), "default_profile", lookup_fn, visited, depth)
        deps.append(p_node)
    return deps


def _collect_workflow_node_deps(
    workflow: dict[str, Any],
    lookup_fn: LookupFn,
    visited: set[str],
    depth: int,
) -> list[DependencyNode]:
    deps: list[DependencyNode] = []
    version = workflow.get("current_version") or {}
    nodes = version.get("nodes") or []
    seen_ids: set[str] = set()

    for node in nodes:
        config = node.get("config") or node.get("config_json") or {}
        node_label = node.get("label", "")
        node_type_val = node.get("node_type", "")

        for key in WORKFLOW_REF_KEYS:
            ref_id = config.get(key)
            if ref_id and str(ref_id) not in seen_ids:
                seen_ids.add(str(ref_id))
                dep = _resolve_entity(
                    "workflow", str(ref_id), "node_workflow_ref",
                    lookup_fn, visited, depth,
                    node_label=node_label, node_type=node_type_val, config_key=key,
                )
                deps.append(dep)

        for key in PROFILE_REF_KEYS:
            ref_id = config.get(key)
            if ref_id and str(ref_id) not in seen_ids:
                seen_ids.add(str(ref_id))
                dep = _resolve_entity(
                    "profile", str(ref_id), "node_profile_ref",
                    lookup_fn, visited, depth,
                    node_label=node_label, node_type=node_type_val, config_key=key,
                )
                deps.append(dep)

    return deps


def _resolve_entity(
    catalog_type: str,
    entity_id: str,
    role: str,
    lookup_fn: LookupFn,
    visited: set[str],
    depth: int,
    node_label: str | None = None,
    node_type: str | None = None,
    config_key: str | None = None,
) -> DependencyNode:
    if depth >= MAX_DEPTH:
        return DependencyNode(
            role=role, template_id=entity_id, template_name=None,
            template_description=None, catalog_type=catalog_type,
            depth_limit_reached=True,
            node_label=node_label, node_type=node_type, config_key=config_key,
        )
    if entity_id in visited:
        return DependencyNode(
            role=role, template_id=entity_id, template_name=None,
            template_description=None, catalog_type=catalog_type,
            circular=True,
            node_label=node_label, node_type=node_type, config_key=config_key,
        )

    entity = lookup_fn(catalog_type, UUID(entity_id))
    if entity is None:
        return DependencyNode(
            role=role, template_id=entity_id, template_name=None,
            template_description=None, catalog_type=catalog_type,
            missing=True,
            node_label=node_label, node_type=node_type, config_key=config_key,
        )

    visited_branch = visited | {entity_id}
    children = _collect_dependencies(catalog_type, entity, lookup_fn, visited_branch, depth + 1)

    return DependencyNode(
        role=role, template_id=entity_id,
        template_name=entity.get("name"),
        template_description=entity.get("description"),
        catalog_type=catalog_type,
        children=children,
        node_label=node_label, node_type=node_type, config_key=config_key,
    )
