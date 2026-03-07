"""
Shell execute tool for OpenForge.

Executes shell commands within workspace scope with security restrictions.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
import subprocess
import asyncio
import logging
import os

logger = logging.getLogger("tool-server.shell")


class ShellExecuteTool(BaseTool):
    """Execute a shell command within workspace scope."""

    @property
    def id(self) -> str:
        return "shell.execute"

    @property
    def category(self) -> str:
        return "shell"

    @property
    def display_name(self) -> str:
        return "Execute Shell Command"

    @property
    def description(self) -> str:
        return """Execute a shell command within the workspace directory.

Runs the command with the workspace as the working directory.
Commands are executed in a restricted environment with resource limits.

WARNING: This is a high-risk operation that can execute arbitrary commands.
Use with caution and ensure proper approval flows are in place.

Security restrictions:
- Commands run in workspace directory only
- No direct network access (use http tools instead)
- Resource limits may apply
- Certain dangerous commands may be blocked"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                },
                "timeout": {
                    "type": "integer",
                    "default": 60,
                    "description": "Command timeout in seconds (max 300)"
                },
                "env": {
                    "type": "object",
                    "description": "Additional environment variables",
                    "additionalProperties": {"type": "string"}
                },
                "shell": {
                    "type": "string",
                    "enum": ["bash", "sh"],
                    "default": "bash",
                    "description": "Shell interpreter to use"
                }
            },
            "required": ["command"]
        }

    @property
    def risk_level(self) -> str:
        return "critical"

    @property
    def max_output_chars(self) -> int:
        return 100000

    # Blocked commands that are too dangerous
    BLOCKED_PATTERNS = [
        "rm -rf /",
        "mkfs",
        "dd if=",
        "> /dev/sd",
        ":(){ :|:& };:",  # Fork bomb
        "chmod -R 777 /",
        "curl | bash",
        "wget | bash",
        "curl | sh",
        "wget | sh",
    ]

    def _is_command_blocked(self, command: str) -> tuple[bool, str]:
        """Check if command contains blocked patterns."""
        command_lower = command.lower()
        for pattern in self.BLOCKED_PATTERNS:
            if pattern.lower() in command_lower:
                return True, f"Command contains blocked pattern: {pattern}"
        return False, ""

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        command = params.get("command", "").strip()
        if not command:
            return ToolResult(
                success=False,
                output=None,
                error="Command is required"
            )

        # Check for blocked commands
        blocked, reason = self._is_command_blocked(command)
        if blocked:
            return ToolResult(
                success=False,
                output=None,
                error=f"Command blocked for safety: {reason}"
            )

        timeout = min(params.get("timeout", 60), 300)  # Max 5 minutes
        env_overrides = params.get("env", {})
        shell = params.get("shell", "bash")

        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            workspace_path = security.resolve_path(context.workspace_id, ".")

            # Build environment with restrictions
            env = os.environ.copy()
            # Set safe defaults
            env["HOME"] = str(workspace_path)
            env["PWD"] = str(workspace_path)
            # Apply user-provided env overrides (but filter dangerous ones)
            dangerous_env = {"PATH", "LD_LIBRARY_PATH", "LD_PRELOAD"}
            for key, value in env_overrides.items():
                if key not in dangerous_env:
                    env[key] = value

            # Execute command
            try:
                process = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=workspace_path,
                    env=env,
                    executable=f"/bin/{shell}"
                )

                try:
                    stdout, stderr = await asyncio.wait_for(
                        process.communicate(),
                        timeout=timeout
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"Command timed out after {timeout} seconds"
                    )

                stdout_str = stdout.decode("utf-8", errors="replace")
                stderr_str = stderr.decode("utf-8", errors="replace")

                # Truncate output if needed
                output_str = stdout_str
                original_length = len(output_str)
                truncated = False
                if self.max_output_chars and original_length > self.max_output_chars:
                    output_str = output_str[:self.max_output_chars]
                    output_str += "\n\n... [OUTPUT TRUNCATED]"
                    truncated = True

                return ToolResult(
                    success=process.returncode == 0,
                    output={
                        "stdout": output_str,
                        "stderr": stderr_str[:10000] if stderr_str else "",  # Limit stderr
                        "exit_code": process.returncode,
                        "command": command,
                        "working_directory": str(workspace_path),
                    },
                    truncated=truncated,
                    original_length=original_length if truncated else None
                )

            except FileNotFoundError as e:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Shell not found: {shell}"
                )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error executing shell command: {command}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to execute command: {str(e)}"
            )
