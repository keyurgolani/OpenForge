"""
Git commit tool for OpenForge.

Creates a commit within workspace scope.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import subprocess
import logging

logger = logging.getLogger("tool-server.git")


class GitCommitTool(BaseTool):
    """Create a commit."""

    @property
    def id(self) -> str:
        return "git.commit"

    @property
    def category(self) -> str:
        return "git"

    @property
    def display_name(self) -> str:
        return "Git Commit"

    @property
    def description(self) -> str:
        return """Create a new commit with the staged changes.

Records changes to the repository with a commit message.
Requires files to be staged first (use git.add).

WARNING: This permanently records changes in the git history.
Use descriptive commit messages."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Commit message describing the changes"
                },
                "allow_empty": {
                    "type": "boolean",
                    "default": False,
                    "description": "Allow creating an empty commit"
                },
                "amend": {
                    "type": "boolean",
                    "default": False,
                    "description": "Amend the previous commit (use with caution)"
                }
            },
            "required": ["message"]
        }

    @property
    def risk_level(self) -> str:
        return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            workspace_path = security.resolve_path(context.workspace_id, ".")

            if not (workspace_path / ".git").exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error="Not a git repository"
                )

            message = params.get("message", "").strip()
            if not message:
                return ToolResult(
                    success=False,
                    output=None,
                    error="Commit message is required"
                )

            allow_empty = params.get("allow_empty", False)
            amend = params.get("amend", False)

            # Check if there are staged changes (unless allow_empty)
            if not allow_empty:
                status_cmd = ["git", "diff", "--staged", "--quiet"]
                status_result = subprocess.run(
                    status_cmd,
                    cwd=workspace_path,
                    capture_output=True,
                    timeout=10
                )
                if status_result.returncode == 0:
                    return ToolResult(
                        success=False,
                        output=None,
                        error="No staged changes to commit. Use git.add to stage files first."
                    )

            cmd = ["git", "commit", "-m", message]

            if allow_empty:
                cmd.append("--allow-empty")
            if amend:
                cmd.append("--amend")
                cmd.append("--no-edit")  # Use the provided message

            result = subprocess.run(
                cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                error_msg = result.stderr.strip()
                if "nothing to commit" in error_msg.lower():
                    return ToolResult(
                        success=False,
                        output=None,
                        error="Nothing to commit. Stage files with git.add first."
                    )
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Git commit failed: {error_msg}"
                )

            # Get the commit hash
            hash_cmd = ["git", "rev-parse", "HEAD"]
            hash_result = subprocess.run(
                hash_cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            commit_hash = hash_result.stdout.strip() if hash_result.returncode == 0 else "unknown"

            # Get short hash
            short_hash_cmd = ["git", "rev-parse", "--short", "HEAD"]
            short_hash_result = subprocess.run(
                short_hash_cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            short_hash = short_hash_result.stdout.strip() if short_hash_result.returncode == 0 else "unknown"

            return ToolResult(
                success=True,
                output={
                    "message": "Commit created successfully",
                    "commit_hash": commit_hash,
                    "short_hash": short_hash,
                    "commit_message": message,
                    "output": result.stdout.strip()
                }
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                error="Git commit timed out"
            )
        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error running git commit: {params}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run git commit: {str(e)}"
            )
