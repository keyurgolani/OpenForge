"""
Git status tool for OpenForge.

Shows the working tree status within workspace scope.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import subprocess
import logging

logger = logging.getLogger("tool-server.git")


class GitStatusTool(BaseTool):
    """Show the working tree status."""

    @property
    def id(self) -> str:
        return "git.status"

    @property
    def category(self) -> str:
        return "git"

    @property
    def display_name(self) -> str:
        return "Git Status"

    @property
    def description(self) -> str:
        return """Show the working tree status.

Returns information about:
- Current branch
- Staged changes (files added to index)
- Unstaged changes (modified but not staged)
- Untracked files

This is a read-only operation that does not modify the repository."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "short": {
                    "type": "boolean",
                    "default": False,
                    "description": "Use short format output (porcelain)"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            workspace_path = security.resolve_path(context.workspace_id, ".")

            if not (workspace_path / ".git").exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error="Not a git repository. Use git.init to initialize one."
                )

            short = params.get("short", False)

            cmd = ["git", "status"]
            if short:
                cmd.append("--short")
            else:
                cmd.append("--porcelain=v1")

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
                    error=f"Git status failed: {result.stderr}"
                )

            # Get branch info
            branch_result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

            # Parse porcelain output
            staged = []
            unstaged = []
            untracked = []

            for line in result.stdout.strip().split("\n"):
                if not line:
                    continue
                index_status = line[0] if len(line) > 0 else " "
                work_tree_status = line[1] if len(line) > 1 else " "
                filepath = line[3:] if len(line) > 3 else ""

                if index_status in "MADRC":
                    staged.append({"status": index_status, "file": filepath})
                if work_tree_status in "MD":
                    unstaged.append({"status": work_tree_status, "file": filepath})
                if index_status == "?" and work_tree_status == "?":
                    untracked.append(filepath)

            return ToolResult(
                success=True,
                output={
                    "branch": current_branch,
                    "staged": staged,
                    "unstaged": unstaged,
                    "untracked": untracked,
                    "raw_output": result.stdout.strip() if short else None,
                    "is_clean": len(staged) == 0 and len(unstaged) == 0 and len(untracked) == 0
                }
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                error="Git status timed out"
            )
        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error running git status: {params}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run git status: {str(e)}"
            )
