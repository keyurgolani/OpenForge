import asyncio
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from config import get_settings


class ShellExecuteTool(BaseTool):
    @property
    def id(self): return "shell.execute"

    @property
    def category(self): return "shell"

    @property
    def display_name(self): return "Execute Shell Command"

    @property
    def description(self):
        return "Execute a shell command in the workspace directory and return stdout/stderr."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to execute"},
                "timeout": {"type": "number", "default": 30, "description": "Timeout in seconds"},
            },
            "required": ["command"],
        }

    @property
    def risk_level(self): return "high"

    @property
    def max_output(self): return 50000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        command = params["command"]
        allowed, reason = security.is_command_allowed(command)
        if not allowed:
            return ToolResult(success=False, error=f"Command blocked: {reason}")

        workspace_dir = security.get_workspace_dir(context.workspace_id)
        timeout = min(params.get("timeout", 30), get_settings().shell_timeout_seconds)

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                cwd=str(workspace_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return ToolResult(success=False, error=f"Command timed out after {timeout}s")

            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")
            combined = out
            if err:
                combined += f"\n[stderr]\n{err}"

            return self._maybe_truncate("", combined.strip())
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
