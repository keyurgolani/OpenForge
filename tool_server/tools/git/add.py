"""
Git add tool for OpenForge.

Stages files for commit within workspace scope.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import subprocess
import logging

logger = logging.getLogger("tool-server.git")


class GitAddTool(BaseTool):
    """Stage files for commit."""

    @property
    def id(self) -> str:
        return "git.add"

    @property
    def category(self) -> str:
        return "git"

    @property
    def display_name(self) -> str:
        return "Git Add"

    @property
    def description(self) -> str:
        return """Stage files for the next commit.

Adds file contents to the staging area (index) in preparation for commit.
Can add specific files, all files, or files matching patterns.

Use with caution - this prepares files to be committed."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "files": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of file paths to stage (relative to workspace root). Use '.' to add all files."
                },
                "all": {
                    "type": "boolean",
                    "default": False,
                    "description": "Stage all changes (equivalent to 'git add -A')"
                },
                "patch": {
                    "type": "boolean",
                    "default": False,
                    "description": "Interactively stage hunks (not recommended for agents)"
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

            if not (workspace_path / ".git").exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error="Not a git repository"
                )

            files = params.get("files", [])
            all_files = params.get("all", False)

            if not files and not all_files:
                return ToolResult(
                    success=False,
                    output=None,
                    error="Either 'files' or 'all' parameter is required"
                )

            cmd = ["git", "add"]

            if all_files:
                cmd.append("-A")
            else:
                # Validate each file path
                for file_path in files:
                    if file_path == ".":
                        # Current directory is fine
                        continue
                    try:
                        validated_path = security.resolve_path(context.workspace_id, file_path)
                        if not str(validated_path).startswith(str(workspace_path)):
                            return ToolResult(
                                success=False,
                                output=None,
                                error=f"Path is outside workspace: {file_path}"
                            )
                    except ValueError as e:
                        return ToolResult(
                            success=False,
                            output=None,
                            error=str(e)
                        )
                cmd.extend(files)

            result = subprocess.run(
                cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Git add failed: {result.stderr}"
                )

            # Get status after add
            status_cmd = ["git", "status", "--short"]
            status_result = subprocess.run(
                status_cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            staged_files = []
            for line in status_result.stdout.strip().split("\n"):
                if line and line[0] in "MADRC":
                    staged_files.append({
                        "status": line[0],
                        "file": line[3:]
                    })

            return ToolResult(
                success=True,
                output={
                    "message": "Files staged successfully",
                    "staged_files": staged_files
                }
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                error="Git add timed out"
            )
        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error running git add: {params}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run git add: {str(e)}"
            )
