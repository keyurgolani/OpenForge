import asyncio
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class GitDiffTool(BaseTool):
    @property
    def id(self): return "git.diff"

    @property
    def category(self): return "git"

    @property
    def display_name(self): return "Git Diff"

    @property
    def description(self): return "Show changes in the working tree or between commits."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Specific file to diff (optional)"},
                "staged": {"type": "boolean", "default": False, "description": "Show staged changes"},
            },
        }

    @property
    def max_output(self): return 50000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        cwd = str(security.get_workspace_dir(context.workspace_id))
        args = ["git", "diff"]
        if params.get("staged"):
            args.append("--cached")
        if params.get("path"):
            args.append("--")
            args.append(params["path"])

        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            out = stdout.decode("utf-8", errors="replace")
            return self._maybe_truncate("", out)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
