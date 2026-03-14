"""
Run domain types.

This module defines the core types and enums for Runs.
"""

from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from backend.openforge.domains.common.enums import ExecutionStatus


class RunType(str, Enum):
    """Types of runs."""

    WORKFLOW = "workflow"  # Direct workflow execution
    MISSION = "mission"  # Mission execution
    STEP = "step"  # Individual step within a workflow


class Run(BaseModel):
    """
    Run - an execution instance.

    A Run represents a single execution of a workflow or mission,
    tracking state, inputs, outputs, and errors.

    Attributes:
        id: Unique identifier
        run_type: Type of run (workflow/mission/step)
        workflow_id: Reference to the workflow (if workflow run)
        mission_id: Reference to the mission (if mission run)
        parent_run_id: Parent run ID for nested executions
        workspace_id: Workspace this run belongs to
        status: Current execution status
        state_snapshot: Current workflow state
        input_payload: Input data for this run
        output_payload: Output data from this run
        error_code: Error code if failed
        error_message: Detailed error message if failed
        started_at: When the run started
        completed_at: When the run completed
    """

    id: UUID = Field(...)
    run_type: RunType = Field(...)
    workflow_id: Optional[UUID] = Field(default=None)
    mission_id: Optional[UUID] = Field(default=None)
    parent_run_id: Optional[UUID] = Field(default=None)
    workspace_id: UUID = Field(...)
    status: ExecutionStatus = Field(default=ExecutionStatus.PENDING)
    state_snapshot: dict[str, Any] = Field(default_factory=dict)
    input_payload: dict[str, Any] = Field(default_factory=dict)
    output_payload: dict[str, Any] = Field(default_factory=dict)
    error_code: Optional[str] = Field(default=None, max_length=100)
    error_message: Optional[str] = Field(default=None, max_length=5000)
    started_at: Optional[str] = Field(default=None)
    completed_at: Optional[str] = Field(default=None)

    class Config:
        from_attributes = True
