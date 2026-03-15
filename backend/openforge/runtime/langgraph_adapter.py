"""LangGraph integration boundary with a local fallback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(slots=True)
class CompiledWorkflowGraph:
    """Compiled workflow graph independent of the orchestration backend."""

    workflow_id: UUID
    workflow_version_id: UUID
    entry_node_id: UUID | None
    nodes: dict[UUID, dict[str, Any]]
    edges_by_from: dict[UUID, list[dict[str, Any]]]
    backend: str

    def next_node_id(self, node_id: UUID, edge_type: str = "success") -> UUID | None:
        candidates = self.edges_by_from.get(node_id, [])
        for edge in candidates:
            if edge["edge_type"] == edge_type:
                return edge["to_node_id"]
        for edge in candidates:
            if edge["edge_type"] == "success":
                return edge["to_node_id"]
        return candidates[0]["to_node_id"] if candidates else None


def compile_workflow_graph(workflow: dict[str, Any]) -> CompiledWorkflowGraph:
    """Compile a workflow version into a graph the coordinator can execute."""

    version = workflow["current_version"]
    nodes = {node["id"]: node for node in version.get("nodes", [])}
    edges_by_from: dict[UUID, list[dict[str, Any]]] = {}
    for edge in sorted(version.get("edges", []), key=lambda item: item.get("priority", 100)):
        edges_by_from.setdefault(edge["from_node_id"], []).append(edge)
    backend = "langgraph" if _langgraph_available() else "local_fallback"
    return CompiledWorkflowGraph(
        workflow_id=workflow["id"],
        workflow_version_id=version["id"],
        entry_node_id=version.get("entry_node_id"),
        nodes=nodes,
        edges_by_from=edges_by_from,
        backend=backend,
    )


def _langgraph_available() -> bool:
    try:
        import langgraph  # type: ignore  # pragma: no cover - optional dependency probe

        return langgraph is not None
    except Exception:
        return False
