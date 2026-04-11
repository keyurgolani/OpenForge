import asyncio
import sys
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from config import get_settings


class ExecutePythonTool(BaseTool):
    @property
    def id(self): return "shell.execute_python"

    @property
    def category(self): return "shell"

    @property
    def display_name(self): return "Execute Python"

    @property
    def description(self):
        return "Execute a Python script string in the workspace directory."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to execute"},
                "timeout": {"type": "number", "default": 30},
            },
            "required": ["code"],
        }

    @property
    def risk_level(self): return "high"

    @property
    def max_output(self): return 50000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        code = params["code"]
        workspace_dir = security.get_workspace_dir(context.workspace_id)
        timeout = min(params.get("timeout", 30), get_settings().shell_timeout_seconds)

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-c", code,
                cwd=str(workspace_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return ToolResult(
                    success=False, error=f"Script timed out after {timeout}s",
                    recovery_hints=["Increase the timeout parameter", "Check for infinite loops or blocking I/O", "Break the script into smaller steps"],
                )

            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")
            combined = out
            if err:
                combined += f"\n[stderr]\n{err}"

            return self._maybe_truncate("", combined.strip())
        except Exception as exc:
            error = str(exc)
            hints = ["Check Python syntax and verify required modules are installed"]
            if "module" in error.lower() or "import" in error.lower():
                hints.append("Install missing packages with shell.execute: pip install <package>")
            return ToolResult(success=False, error=error, recovery_hints=hints)
