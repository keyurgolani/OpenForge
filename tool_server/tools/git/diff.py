"""
Git diff tool for OpenForge.

Shows changes between commits and working tree within workspace scope.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
import subprocess
import logging

logger = logging.getLogger("tool-server.git")


class GitDiffTool(BaseTool):
    """Show changes between commits and working tree."""

    @property
    def id(self) -> str:
        return "git.diff"

    @property
    def category(self) -> str:
        return "git"

    @property
    def display_name(self) -> str:
        return "Git Diff"

    @property
    def description(self) -> str:
        return """Show changes between commits, commit and working tree, etc.

Shows the differences between:
- Working directory and index (default)
- Two commits (when commit1 and commit2 are specified)
- Staged changes (when staged=true)

This is a read-only operation that does not modify the repository."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "commit1": {
                    "type": "string",
                    "description": "First commit hash or reference (optional)"
                },
                "commit2": {
                    "type": "string",
                    "description": "Second commit hash or reference (optional)"
                },
                "path": {
                    "type": "string",
                    "description": "Limit diff to specific file or directory"
                },
                "staged": {
                    "type": "boolean",
                    "default": False,
                    "description": "Show staged changes (changes in index vs HEAD)"
                },
                "context_lines": {
                    "type": "integer",
                    "default": 3,
                    "description": "Number of context lines to show around changes"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    @property
    def max_output_chars(self) -> int:
        return 50000

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

            cmd = ["git", "diff"]

            commit1 = params.get("commit1")
            commit2 = params.get("commit2")
            staged = params.get("staged", False)
            path = params.get("path")
            context_lines = params.get("context_lines", 3)

            if staged:
                cmd.append("--staged")
            elif commit1 and commit2:
                cmd.extend([commit1, commit2])
            elif commit1:
                cmd.append(commit1)

            cmd.append(f"-U{context_lines}")

            if path:
                # Validate path is within workspace
                validated_path = security.resolve_path(context.workspace_id, path)
                if not str(validated_path).startswith(str(workspace_path)):
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"Path is outside workspace: {path}"
                    )
                cmd.append("--")
                cmd.append(path)

            result = subprocess.run(
                cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0 and result.stderr:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Git diff failed: {result.stderr}"
                )

            diff_output = result.stdout

            # Truncate if needed
            original_length = len(diff_output)
            truncated = False
            if self.max_output_chars and original_length > self.max_output_chars:
                diff_output = diff_output[:self.max_output_chars]
                diff_output += "\n\n... [OUTPUT TRUNCATED]"
                truncated = True

            # Parse stats
            stats_cmd = ["git", "diff", "--stat"]
            if staged:
                stats_cmd.append("--staged")
            elif commit1 and commit2:
                stats_cmd.extend([commit1, commit2])
            elif commit1:
                stats_cmd.append(commit1)
            if path:
                stats_cmd.extend(["--", path])

            stats_result = subprocess.run(
                stats_cmd,
                cwd=workspace_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            stats = None
            if stats_result.returncode == 0:
                stats = stats_result.stdout.strip()

            return ToolResult(
                success=True,
                output={
                    "diff": diff_output,
                    "stats": stats,
                    "has_changes": len(result.stdout.strip()) > 0
                },
                truncated=truncated,
                original_length=original_length if truncated else None
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                error="Git diff timed out"
            )
        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error running git diff: {params}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run git diff: {str(e)}"
            )
