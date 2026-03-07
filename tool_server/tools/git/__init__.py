"""
Git tools for OpenForge.

Tools for git operations within workspace scope.
Requires the workspace to be a git repository.
"""
from protocol import BaseTool
from .status import GitStatusTool
from .diff import GitDiffTool
from .log import GitLogTool
from .add import GitAddTool
from .commit import GitCommitTool
from .init import GitInitTool

TOOLS: list[BaseTool] = [
    GitStatusTool(),
    GitDiffTool(),
    GitLogTool(),
    GitAddTool(),
    GitCommitTool(),
    GitInitTool(),
]
