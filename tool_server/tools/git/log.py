import asyncio
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class GitLogTool(BaseTool):
    @property
    def id(self): return "git.log"

    @property
    def category(self): return "git"

    @property
    def display_name(self): return "Git Log"

    @property
    def description(self): return "Show the commit log for the workspace git repository."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 10, "description": "Number of commits to show"},
                "oneline": {"type": "boolean", "default": True, "description": "Compact one-line format"},
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        cwd = str(security.get_workspace_dir(context.workspace_id))
        limit = params.get("limit", 10)
        args = ["git", "log", f"-{limit}"]
        if params.get("oneline", True):
            args.append("--oneline")

        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")
            if proc.returncode != 0 and err:
                return ToolResult(success=False, error=err.strip())
            return ToolResult(success=True, output=out.strip())
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
