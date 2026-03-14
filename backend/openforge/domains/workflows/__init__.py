"""
Workflows domain package.

Workflow Definitions - composable execution graphs that define how tasks are performed.
"""

from backend.openforge.domains.workflows.types import (
    NodeType,
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowNode,
    WorkflowStatus,
)

__all__ = [
    "WorkflowDefinition",
    "WorkflowNode",
    "WorkflowEdge",
    "NodeType",
    "WorkflowStatus",
]
