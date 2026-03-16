"""
Workflows domain package.

Workflow Definitions - composable execution graphs that define how tasks are performed.
"""

from .types import (
    NodeType,
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowEdgeStatus,
    WorkflowNode,
    WorkflowNodeStatus,
    WorkflowStatus,
    WorkflowVersion,
    WorkflowVersionStatus,
)
from .schemas import (
    WorkflowCreate,
    WorkflowEdgeCreate,
    WorkflowEdgeListResponse,
    WorkflowEdgeResponse,
    WorkflowEdgeUpdate,
    WorkflowListResponse,
    WorkflowNodeCreate,
    WorkflowNodeListResponse,
    WorkflowNodeResponse,
    WorkflowNodeUpdate,
    WorkflowResponse,
    WorkflowUpdate,
    WorkflowVersionCreate,
    WorkflowVersionListResponse,
    WorkflowVersionResponse,
)
from .seed import get_seed_workflow_blueprints, seed_example_workflows
from .router import router

__all__ = [
    "WorkflowDefinition",
    "WorkflowVersion",
    "WorkflowNode",
    "WorkflowEdge",
    "NodeType",
    "WorkflowStatus",
    "WorkflowVersionStatus",
    "WorkflowNodeStatus",
    "WorkflowEdgeStatus",
    "WorkflowCreate",
    "WorkflowUpdate",
    "WorkflowResponse",
    "WorkflowListResponse",
    "WorkflowVersionCreate",
    "WorkflowVersionResponse",
    "WorkflowVersionListResponse",
    "WorkflowNodeCreate",
    "WorkflowNodeUpdate",
    "WorkflowNodeResponse",
    "WorkflowNodeListResponse",
    "WorkflowEdgeCreate",
    "WorkflowEdgeUpdate",
    "WorkflowEdgeResponse",
    "WorkflowEdgeListResponse",
    # DEFAULT_SEED_WORKSPACE_ID removed — workflows are workspace-agnostic
    "get_seed_workflow_blueprints",
    "seed_example_workflows",
    "router",
]
