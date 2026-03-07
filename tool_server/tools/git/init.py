"""
Git init tool for OpenForge.

Initializes a new git repository within workspace scope.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
import subprocess
import logging

logger = logging.getLogger("tool-server.git")


class GitInitTool(BaseTool):
    """Initialize a new git repository."""

    @property
    def id(self) -> str:
        return "git.init"

    @property
    def category(self) -> str:
        return "git"

    @property
    def display_name(self) -> str:
        return "Git Init"

    @property
    def description(self) -> str:
        return """Initialize a new git repository.

Creates a new .git directory in the workspace, enabling version control.
This is typically done once when setting up a new project.

Options:
- branch: Initial branch name (default: 'main')
- bare: Create a bare repository (for servers, usually not needed)"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "branch": {
                    "type": "string",
                    "default": "main",
                    "description": "Initial branch name"
                },
                "bare": {
                    "type": "boolean",
                    "default": False,
                    "description": "Create a bare repository (no working directory)"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            workspace_path = security.resolve_path(context.workspace_id, ".")

            # Check if already a git repository
            if (workspace_path / ".git").exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error="Git repository already exists in this workspace"
                )

            branch = params.get("branch", "main")
            bare = params.get("bare", False)

            cmd = ["git", "init"]

            if bare:
                cmd.append("--bare")
            else:
                cmd.extend(["--initial-branch", branch])

            result = subprocess.run(
                cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Git init failed: {result.stderr}"
                )

            # Get the branch name
            branch_cmd = ["git", "branch", "--show-current"]
            branch_result = subprocess.run(
                branch_cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = branch_result.stdout.strip() if branch_result.returncode == 0 else branch

            # Check if we should create an initial commit
            # (Git 2.28+ supports initial branch without commit)
            # We'll suggest creating an initial commit

            return ToolResult(
                success=True,
                output={
                    "message": "Git repository initialized successfully",
                    "branch": current_branch,
                    "path": str(workspace_path),
                    "is_bare": bare,
                    "output": result.stdout.strip(),
                    "suggestion": "Consider creating an initial commit with 'git commit --allow-empty -m \"Initial commit\"' to set up the branch."
                }
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                error="Git init timed out"
            )
        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error running git init: {params}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run git init: {str(e)}"
            )
