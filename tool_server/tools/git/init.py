import asyncio
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class GitInitTool(BaseTool):
    @property
    def id(self): return "git.init"

    @property
    def category(self): return "git"

    @property
    def display_name(self): return "Git Init"

    @property
    def description(self): return "Initialize a new git repository in the workspace."

    @property
    def input_schema(self):
        return {"type": "object", "properties": {}}

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        cwd = str(security.get_workspace_dir(context.workspace_id))
        try:
            proc = await asyncio.create_subprocess_exec(
                "git", "init",
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")
            if proc.returncode != 0:
                return ToolResult(success=False, error=err.strip())
            return ToolResult(success=True, output=out.strip())
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
