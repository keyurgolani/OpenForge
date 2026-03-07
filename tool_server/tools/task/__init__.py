"""
Task tools for OpenForge.

Tools for planning and tracking multi-step agent tasks.
Provides lightweight task orchestration.
"""
from protocol import BaseTool
from .create_plan import TaskCreatePlanTool
from .update_step import TaskUpdateStepTool
from .get_plan import TaskGetPlanTool

TOOLS: list[BaseTool] = [
    TaskCreatePlanTool(),
    TaskUpdateStepTool(),
    TaskGetPlanTool(),
]
