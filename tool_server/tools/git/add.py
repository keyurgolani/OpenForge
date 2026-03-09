import asyncio
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class GitAddTool(BaseTool):
    @property
    def id(self): return "git.add"

    @property
    def category(self): return "git"

    @property
    def display_name(self): return "Git Add"

    @property
    def description(self): return "Stage files for commit."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "default": ".", "description": "Path to stage (use '.' for all)"},
            },
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        cwd = str(security.get_workspace_dir(context.workspace_id))
        path = params.get("path", ".")
        try:
            proc = await asyncio.create_subprocess_exec(
                "git", "add", path,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            err = stderr.decode("utf-8", errors="replace")
            if proc.returncode != 0:
                return ToolResult(success=False, error=err.strip())
            # Report what was staged
            diff_proc = await asyncio.create_subprocess_exec(
                "git", "diff", "--name-status", "--cached",
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            diff_out, _ = await asyncio.wait_for(diff_proc.communicate(), timeout=10)
            staged = diff_out.decode("utf-8", errors="replace").strip()
            if staged:
                lines = staged.splitlines()
                files = [line.split("\t", 1)[-1] for line in lines]
                status_map = {"A": "added", "M": "modified", "D": "deleted", "R": "renamed"}
                details = [
                    f"{status_map.get(line[0], line[0].lower())}: {line.split(chr(9), 1)[-1]}"
                    for line in lines
                ]
                output = f"Staged {len(files)} file(s):\n" + "\n".join(details)
            else:
                output = f"Staged '{path}' (nothing new to stage)"
            return ToolResult(success=True, output=output)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
