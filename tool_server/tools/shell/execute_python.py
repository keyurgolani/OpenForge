"""
Execute Python tool for OpenForge.

Executes Python scripts within workspace scope with safety restrictions.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import subprocess
import asyncio
import logging
import os
import tempfile

logger = logging.getLogger("tool-server.shell")


class ShellExecutePythonTool(BaseTool):
    """Execute a Python script within workspace scope."""

    @property
    def id(self) -> str:
        return "shell.execute_python"

    @property
    def category(self) -> str:
        return "shell"

    @property
    def display_name(self) -> str:
        return "Execute Python Script"

    @property
    def description(self) -> str:
        return """Execute a Python script within the workspace directory.

Runs Python code with the workspace as the working directory.
The script runs in a restricted environment with limited imports.

Use for:
- Running data processing scripts
- Executing utility code
- Quick calculations and transformations

WARNING: This can execute arbitrary Python code. Ensure proper approval
flows are in place for high-risk operations."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The Python code to execute"
                },
                "file": {
                    "type": "string",
                    "description": "Path to a Python file in the workspace (alternative to 'code')"
                },
                "timeout": {
                    "type": "integer",
                    "default": 60,
                    "description": "Execution timeout in seconds (max 300)"
                },
                "args": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Command line arguments to pass to the script"
                },
                "env": {
                    "type": "object",
                    "description": "Additional environment variables",
                    "additionalProperties": {"type": "string"}
                }
            },
            "required": []  # Either code or file is required
        }

    @property
    def risk_level(self) -> str:
        return "high"

    @property
    def max_output_chars(self) -> int:
        return 100000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        code = params.get("code", "").strip()
        file_path = params.get("file", "").strip()
        timeout = min(params.get("timeout", 60), 300)  # Max 5 minutes
        args = params.get("args", [])
        env_overrides = params.get("env", {})

        if not code and not file_path:
            return ToolResult(
                success=False,
                output=None,
                error="Either 'code' or 'file' parameter is required"
            )

        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            workspace_path = security.resolve_path(context.workspace_id, ".")

            # Build environment with restrictions
            env = os.environ.copy()
            env["HOME"] = str(workspace_path)
            env["PWD"] = str(workspace_path)
            # Python-specific env
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            env["PYTHONUNBUFFERED"] = "1"

            # Apply user-provided env overrides (but filter dangerous ones)
            dangerous_env = {"PATH", "LD_LIBRARY_PATH", "LD_PRELOAD", "PYTHONPATH"}
            for key, value in env_overrides.items():
                if key not in dangerous_env:
                    env[key] = value

            # Determine script source
            if file_path:
                # Validate and resolve file path
                script_path = security.resolve_path(context.workspace_id, file_path)
                if not script_path.exists():
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"Python file not found: {file_path}"
                    )
                if not script_path.suffix == ".py":
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"File must be a Python file (.py): {file_path}"
                    )
            else:
                # Write code to a temporary file
                script_path = workspace_path / f".temp_script_{context.execution_id[:8] or 'temp'}.py"
                with open(script_path, "w") as f:
                    f.write(code)

            # Build command
            cmd = ["python3", str(script_path)] + args

            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=workspace_path,
                    env=env
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
                        error=f"Python execution timed out after {timeout} seconds"
                    )

                stdout_str = stdout.decode("utf-8", errors="replace")
                stderr_str = stderr.decode("utf-8", errors="replace")

                # Clean up temp file if we created one
                if code and script_path.exists():
                    try:
                        script_path.unlink()
                    except Exception:
                        pass

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
                        "stderr": stderr_str[:10000] if stderr_str else "",
                        "exit_code": process.returncode,
                        "working_directory": str(workspace_path),
                    },
                    truncated=truncated,
                    original_length=original_length if truncated else None
                )

            except FileNotFoundError:
                return ToolResult(
                    success=False,
                    output=None,
                    error="Python interpreter not found"
                )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error executing Python code")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to execute Python: {str(e)}"
            )
