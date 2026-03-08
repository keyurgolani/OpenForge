"""
Git log tool for OpenForge.

Shows commit history within workspace scope.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import subprocess
import json
import logging

logger = logging.getLogger("tool-server.git")


class GitLogTool(BaseTool):
    """Show commit history."""

    @property
    def id(self) -> str:
        return "git.log"

    @property
    def category(self) -> str:
        return "git"

    @property
    def display_name(self) -> str:
        return "Git Log"

    @property
    def description(self) -> str:
        return """Show commit history.

Returns a list of commits with:
- Commit hash
- Author name and email
- Date
- Commit message
- List of changed files (optional)

This is a read-only operation that does not modify the repository."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "max_count": {
                    "type": "integer",
                    "default": 20,
                    "description": "Maximum number of commits to return"
                },
                "path": {
                    "type": "string",
                    "description": "Limit to commits affecting this file or directory"
                },
                "author": {
                    "type": "string",
                    "description": "Filter by author name or email pattern"
                },
                "since": {
                    "type": "string",
                    "description": "Show commits more recent than date (e.g., '2 weeks ago', '2024-01-01')"
                },
                "until": {
                    "type": "string",
                    "description": "Show commits older than date"
                },
                "include_files": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include list of changed files in each commit"
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
                    error="Not a git repository"
                )

            max_count = params.get("max_count", 20)
            path = params.get("path")
            author = params.get("author")
            since = params.get("since")
            until = params.get("until")
            include_files = params.get("include_files", False)

            # Build log format for structured output
            format_fields = [
                "hash:%H",
                "abbrev_hash:%h",
                "subject:%s",
                "author_name:%an",
                "author_email:%ae",
                "date:%aI"
            ]
            format_str = "%n".join(format_fields) + "%n---COMMIT---"

            cmd = [
                "git", "log",
                f"--format={format_str}",
                f"-{max_count}"
            ]

            if author:
                cmd.extend(["--author", author])
            if since:
                cmd.extend(["--since", since])
            if until:
                cmd.extend(["--until", until])
            if include_files:
                cmd.append("--name-status")

            if path:
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

            if result.returncode != 0:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Git log failed: {result.stderr}"
                )

            # Parse the log output
            commits = []
            current_commit = {}
            current_files = []

            for line in result.stdout.split("\n"):
                if line == "---COMMIT---":
                    if current_commit:
                        if include_files:
                            current_commit["files"] = current_files
                        commits.append(current_commit)
                    current_commit = {}
                    current_files = []
                    continue

                if not line:
                    continue

                # Parse field
                if ":" in line:
                    key, value = line.split(":", 1)
                    if key in ["hash", "abbrev_hash", "subject", "author_name", "author_email", "date"]:
                        current_commit[key] = value

                # Parse file status (if include_files)
                elif include_files and line[0] in "MADRC\t":
                    parts = line.split("\t")
                    if len(parts) >= 2:
                        status = parts[0].strip()
                        filepath = parts[1]
                        current_files.append({"status": status[0], "file": filepath})

            # Add last commit if any
            if current_commit and current_commit.get("hash"):
                if include_files:
                    current_commit["files"] = current_files
                commits.append(current_commit)

            return ToolResult(
                success=True,
                output={
                    "commits": commits,
                    "count": len(commits),
                    "has_more": len(commits) == max_count
                }
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                error="Git log timed out"
            )
        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error running git log: {params}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run git log: {str(e)}"
            )
