"""DAG validation and execution ordering for multi-node automations."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any


def validate_dag(nodes: list[dict], edges: list[dict]) -> list[str]:
    """Validate the graph is a DAG using Kahn's algorithm.

    Returns topological order of node_keys. Raises ValueError on cycle.
    """
    node_keys = {n["node_key"] for n in nodes}
    in_degree: dict[str, int] = {k: 0 for k in node_keys}
    adj: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        src = edge["source_node_key"]
        tgt = edge["target_node_key"]
        adj[src].append(tgt)
        in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue = deque(k for k, d in in_degree.items() if d == 0)
    order: list[str] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(order) != len(node_keys):
        raise ValueError("Cycle detected in automation graph")

    return order


def compute_execution_order(nodes: list[dict], edges: list[dict]) -> list[list[str]]:
    """Return execution levels for parallel execution.

    Nodes at the same level have no dependencies between them.
    """
    topo_order = validate_dag(nodes, edges)
    node_keys = {n["node_key"] for n in nodes}

    # Build reverse adjacency for depth calculation
    predecessors: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        predecessors[edge["target_node_key"]].add(edge["source_node_key"])

    # Compute level for each node
    levels: dict[str, int] = {}
    for node_key in topo_order:
        if not predecessors[node_key]:
            levels[node_key] = 0
        else:
            levels[node_key] = max(levels[p] for p in predecessors[node_key]) + 1

    # Group by level
    max_level = max(levels.values()) if levels else 0
    result: list[list[str]] = [[] for _ in range(max_level + 1)]
    for node_key in topo_order:
        result[levels[node_key]].append(node_key)

    return result


def resolve_unfilled_inputs(
    nodes: list[dict],
    edges: list[dict],
    static_inputs: list[dict],
    agent_specs: dict[str, dict],
) -> list[dict]:
    """Determine which inputs need to be provided at deployment time.

    Returns a list of {node_key, input_key, type, label, description, required}
    for inputs that are neither wired nor statically filled.
    """
    # Build lookup of wired inputs: (target_node_key, target_input_key) -> source
    wired: set[tuple[str, str]] = set()
    for edge in edges:
        wired.add((edge["target_node_key"], edge["target_input_key"]))

    # Build lookup of static inputs: (node_key, input_key) -> value
    static: set[tuple[str, str]] = set()
    for si in static_inputs:
        static.add((si["node_key"], si["input_key"]))

    unfilled: list[dict] = []
    for node in nodes:
        node_key = node["node_key"]
        spec = agent_specs.get(node_key, {})
        input_schema = spec.get("input_schema", [])

        for param in input_schema:
            param_name = param.get("name", "")
            if (node_key, param_name) in wired:
                continue
            if (node_key, param_name) in static:
                continue
            entry: dict = {
                "node_key": node_key,
                "input_key": param_name,
                "type": param.get("type", "text"),
                "label": param.get("label", param_name),
                "description": param.get("description"),
                "required": param.get("required", True),
                "default": param.get("default"),
            }
            if param.get("options"):
                entry["options"] = param["options"]
            unfilled.append(entry)

    return unfilled


def validate_type_compatibility(
    edges: list[dict],
    agent_specs: dict[str, dict],
) -> list[str]:
    """Check type compatibility between connected ports. Returns warnings."""
    warnings: list[str] = []

    for edge in edges:
        src_spec = agent_specs.get(edge["source_node_key"], {})
        tgt_spec = agent_specs.get(edge["target_node_key"], {})

        src_outputs = src_spec.get("output_definitions", [{"key": "output", "type": "text"}])
        tgt_inputs = tgt_spec.get("input_schema", [])

        src_type = "text"
        for out_def in src_outputs:
            if out_def.get("key") == edge.get("source_output_key", "output"):
                src_type = out_def.get("type", "text")
                break

        tgt_type = "text"
        for in_def in tgt_inputs:
            if in_def.get("name") == edge.get("target_input_key"):
                tgt_type = in_def.get("type", "text")
                break

        if src_type != tgt_type and src_type != "text":
            warnings.append(
                f"Type mismatch: {edge['source_node_key']}.{edge.get('source_output_key', 'output')} "
                f"({src_type}) -> {edge['target_node_key']}.{edge['target_input_key']} ({tgt_type})"
            )

    return warnings
