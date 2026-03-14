"""
Integrations Package Root

This package centralizes external integrations:
- llm: LLM provider management
- tools: Tool server integration
- workspace: Workspace file operations
- files: File handling utilities
"""

from openforge.integrations.llm import (
    LLMIntegrationService,
    llm_integration_service,
)
from openforge.integrations.tools import (
    ToolDispatcher,
    tool_dispatcher,
)
from openforge.integrations.workspace import (
    WorkspaceIntegration,
    workspace_integration,
)
from openforge.integrations.files import (
    FileOperationsIntegration,
    file_operations,
)

__all__ = [
    # LLM
    "LLMIntegrationService",
    "llm_integration_service",
    # Tools
    "ToolDispatcher",
    "tool_dispatcher",
    # Workspace
    "WorkspaceIntegration",
    "workspace_integration",
    # Files
    "FileOperationsIntegration",
    "file_operations",
]
