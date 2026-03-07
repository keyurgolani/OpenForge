"""
Shell tools for OpenForge.

Tools for executing shell commands and Python scripts.
HIGH RISK - All commands are validated and require HITL approval.
"""
from protocol import BaseTool
from .execute import ShellExecuteTool
from .execute_python import ShellExecutePythonTool

TOOLS: list[BaseTool] = [
    ShellExecuteTool(),
    ShellExecutePythonTool(),
]
