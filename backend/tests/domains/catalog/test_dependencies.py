"""Tests for catalog dependency tree resolution."""
import pytest
from uuid import uuid4, UUID

from openforge.domains.catalog.dependencies import (
    resolve_dependency_tree,
    DependencyNode,
)


def _fake_mission(workflow_id: UUID, profile_ids: list[UUID]) -> dict:
    return {
        "id": uuid4(),
        "name": "Test Mission",
        "description": "desc",
        "workflow_id": workflow_id,
        "default_profile_ids": [str(p) for p in profile_ids],
        "is_template": True,
    }


def _fake_workflow(nodes: list[dict] | None = None) -> dict:
    return {
        "id": uuid4(),
        "name": "Test Workflow",
        "description": "desc",
        "is_template": True,
        "current_version": {
            "nodes": nodes or [],
            "edges": [],
        },
    }


def _fake_profile() -> dict:
    return {
        "id": uuid4(),
        "name": "Test Profile",
        "description": "desc",
        "is_template": True,
    }


class TestResolveDependencyTree:
    def test_profile_has_no_dependencies(self):
        profile = _fake_profile()
        tree = resolve_dependency_tree("profile", profile, lookup_fn=lambda *a: None)
        assert tree.dependencies == []

    def test_mission_finds_workflow_dependency(self):
        wf = _fake_workflow()
        profile = _fake_profile()
        mission = _fake_mission(wf["id"], [profile["id"]])

        def lookup(catalog_type: str, entity_id: UUID):
            if str(entity_id) == str(wf["id"]):
                return wf
            if str(entity_id) == str(profile["id"]):
                return profile
            return None

        tree = resolve_dependency_tree("mission", mission, lookup_fn=lookup)
        roles = [d.role for d in tree.dependencies]
        assert "workflow" in roles
        assert "default_profile" in roles

    def test_workflow_finds_child_workflow_in_node_config(self):
        child_wf = _fake_workflow()
        parent_wf = _fake_workflow(nodes=[{
            "id": str(uuid4()),
            "node_type": "fanout",
            "label": "Fan-out",
            "config": {"child_workflow_id": str(child_wf["id"])},
        }])

        def lookup(catalog_type: str, entity_id: UUID):
            if str(entity_id) == str(child_wf["id"]):
                return child_wf
            return None

        tree = resolve_dependency_tree("workflow", parent_wf, lookup_fn=lookup)
        assert len(tree.dependencies) == 1
        assert tree.dependencies[0].role == "node_workflow_ref"
        assert tree.dependencies[0].template_id == str(child_wf["id"])

    def test_cycle_detection(self):
        wf_id = uuid4()
        wf = _fake_workflow(nodes=[{
            "id": str(uuid4()),
            "node_type": "delegate_call",
            "label": "Self-ref",
            "config": {"child_workflow_id": str(wf_id)},
        }])
        wf["id"] = wf_id

        def lookup(catalog_type: str, entity_id: UUID):
            if str(entity_id) == str(wf_id):
                return wf
            return None

        tree = resolve_dependency_tree("workflow", wf, lookup_fn=lookup)
        assert tree.dependencies[0].circular is True

    def test_missing_reference(self):
        mission = _fake_mission(uuid4(), [])
        tree = resolve_dependency_tree("mission", mission, lookup_fn=lambda *a: None)
        assert tree.dependencies[0].missing is True
        assert tree.dependencies[0].template_name is None

    def test_depth_limit(self):
        workflows = {}
        prev_id = None
        for i in range(12):
            wf_id = uuid4()
            nodes = []
            if prev_id:
                nodes = [{"id": str(uuid4()), "node_type": "delegate_call", "label": f"delegate-{i}", "config": {"child_workflow_id": str(prev_id)}}]
            workflows[str(wf_id)] = _fake_workflow(nodes)
            workflows[str(wf_id)]["id"] = wf_id
            prev_id = wf_id

        root_wf = workflows[str(prev_id)]

        def lookup(catalog_type: str, entity_id: UUID):
            return workflows.get(str(entity_id))

        tree = resolve_dependency_tree("workflow", root_wf, lookup_fn=lookup)
        assert tree is not None

    def test_workflow_id_key_in_node_config(self):
        """The bare 'workflow_id' key in node config should also be detected."""
        child_wf = _fake_workflow()
        parent_wf = _fake_workflow(nodes=[{
            "id": str(uuid4()),
            "node_type": "subworkflow",
            "label": "Sub",
            "config": {"workflow_id": str(child_wf["id"])},
        }])

        def lookup(catalog_type: str, entity_id: UUID):
            if str(entity_id) == str(child_wf["id"]):
                return child_wf
            return None

        tree = resolve_dependency_tree("workflow", parent_wf, lookup_fn=lookup)
        assert len(tree.dependencies) == 1
        assert tree.dependencies[0].config_key == "workflow_id"

    def test_target_profile_in_handoff_node(self):
        profile = _fake_profile()
        wf = _fake_workflow(nodes=[{
            "id": str(uuid4()),
            "node_type": "handoff",
            "label": "Handoff",
            "config": {"target_profile_id": str(profile["id"])},
        }])

        def lookup(catalog_type: str, entity_id: UUID):
            if str(entity_id) == str(profile["id"]):
                return profile
            return None

        tree = resolve_dependency_tree("workflow", wf, lookup_fn=lookup)
        assert len(tree.dependencies) == 1
        assert tree.dependencies[0].role == "node_profile_ref"
        assert tree.dependencies[0].catalog_type == "profile"
